import { randomUUID } from "node:crypto";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { openDatabase, type DatabaseHandle } from "./db/client.js";

export interface AuthorizationCodeRecord {
  clientId: string;
  params: AuthorizationParams;
  expiresAtMs: number;
}

export interface TokenRecord {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: string;
}

export interface ConsentRecord {
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  approvedAt: number;
}

export interface PersistedTokenPair {
  accessTokenHash: string;
  accessToken: TokenRecord;
  refreshTokenHash: string;
  refreshToken: TokenRecord;
}

interface SerializedAuthorizationParams extends Omit<AuthorizationParams, "resource"> {
  resource?: string;
}

interface StoredTokenRecord {
  tokenHash?: string;
  clientId?: string;
  scopes?: string[];
  expiresAt?: number;
  resource?: string;
}

interface StoredConsentRecord {
  clientId?: string;
  redirectUri?: string;
  resource?: string;
  scopes?: string[];
  approvedAt?: number;
}

interface StoredOAuthState {
  clients?: OAuthClientInformationFull[];
  accessTokens?: StoredTokenRecord[];
  refreshTokens?: StoredTokenRecord[];
  approvedConsents?: StoredConsentRecord[];
}

export class SqliteOAuthStore {
  private readonly database: DatabaseHandle;

  constructor(stateDirOrPath: string, legacyStatePath?: string) {
    const statePath = legacyStatePath ?? inferLegacyStatePath(stateDirOrPath);
    const stateDir = legacyStatePath
      ? stateDirOrPath
      : statePath
        ? dirname(statePath)
        : stateDirOrPath;
    this.database = openDatabase(stateDir);
    this.importLegacyState(statePath);
    this.deleteExpired();
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = this.database.sqlite
      .prepare("select client_json from oauth_clients where client_id = ?")
      .get(clientId) as { client_json: string } | undefined;
    return row ? (JSON.parse(row.client_json) as OAuthClientInformationFull) : undefined;
  }

  listClients(): OAuthClientInformationFull[] {
    const rows = this.database.sqlite
      .prepare("select client_json from oauth_clients order by created_at asc")
      .all() as { client_json: string }[];
    return rows.map((row) => JSON.parse(row.client_json) as OAuthClientInformationFull);
  }

  saveClient(client: OAuthClientInformationFull): void {
    this.database.sqlite
      .prepare("insert or replace into oauth_clients (client_id, client_json, created_at) values (?, ?, ?)")
      .run(client.client_id, JSON.stringify(client), client.client_id_issued_at ?? Math.floor(Date.now() / 1000));
  }

  getAuthorizationCode(codeHash: string): AuthorizationCodeRecord | undefined {
    const row = this.database.sqlite
      .prepare("select client_id, params_json, expires_at_ms from oauth_authorization_codes where code_hash = ?")
      .get(codeHash) as {
        client_id: string;
        params_json: string;
        expires_at_ms: number;
      } | undefined;
    if (!row) return undefined;
    if (row.expires_at_ms < Date.now()) {
      this.deleteAuthorizationCode(codeHash);
      return undefined;
    }
    return {
      clientId: row.client_id,
      params: deserializeAuthorizationParams(row.params_json),
      expiresAtMs: row.expires_at_ms,
    };
  }

  saveAuthorizationCode(codeHash: string, record: AuthorizationCodeRecord): void {
    this.database.sqlite
      .prepare(
        "insert or replace into oauth_authorization_codes (code_hash, client_id, params_json, expires_at_ms) values (?, ?, ?, ?)",
      )
      .run(codeHash, record.clientId, serializeAuthorizationParams(record.params), record.expiresAtMs);
  }

  deleteAuthorizationCode(codeHash: string): void {
    this.database.sqlite
      .prepare("delete from oauth_authorization_codes where code_hash = ?")
      .run(codeHash);
  }

  getAccessToken(tokenHash: string): TokenRecord | undefined {
    const row = this.database.sqlite
      .prepare(
        "select client_id, scopes_json, expires_at, resource from oauth_access_tokens where token_hash = ?",
      )
      .get(tokenHash) as
      | {
          client_id: string;
          scopes_json: string;
          expires_at: number;
          resource: string | null;
        }
      | undefined;
    if (!row) return undefined;
    if (row.expires_at < Math.floor(Date.now() / 1000)) {
      this.deleteAccessToken(tokenHash);
      return undefined;
    }
    return {
      clientId: row.client_id,
      scopes: JSON.parse(row.scopes_json) as string[],
      expiresAt: row.expires_at,
      resource: row.resource ?? undefined,
    };
  }

  saveAccessToken(tokenHash: string, record: TokenRecord): void {
    this.database.sqlite
      .prepare(
        `insert into oauth_access_tokens (token_hash, client_id, scopes_json, expires_at, resource)
         values (?, ?, ?, ?, ?)
         on conflict(token_hash) do update set
           client_id = excluded.client_id,
           scopes_json = excluded.scopes_json,
           expires_at = excluded.expires_at,
           resource = excluded.resource`,
      )
      .run(
        tokenHash,
        record.clientId,
        JSON.stringify(record.scopes),
        record.expiresAt,
        record.resource ?? null,
      );
  }

  deleteAccessToken(tokenHash: string): void {
    this.database.sqlite.prepare("delete from oauth_access_tokens where token_hash = ?").run(tokenHash);
  }

  getRefreshToken(tokenHash: string): TokenRecord | undefined {
    const row = this.database.sqlite
      .prepare(
        "select client_id, scopes_json, expires_at, resource from oauth_refresh_tokens where token_hash = ?",
      )
      .get(tokenHash) as
      | {
          client_id: string;
          scopes_json: string;
          expires_at: number;
          resource: string | null;
        }
      | undefined;
    if (!row) return undefined;
    if (row.expires_at < Math.floor(Date.now() / 1000)) {
      this.deleteRefreshToken(tokenHash);
      return undefined;
    }
    return {
      clientId: row.client_id,
      scopes: JSON.parse(row.scopes_json) as string[],
      expiresAt: row.expires_at,
      resource: row.resource ?? undefined,
    };
  }

  saveRefreshToken(tokenHash: string, record: TokenRecord): void {
    this.database.sqlite
      .prepare(
        `insert into oauth_refresh_tokens (token_hash, client_id, scopes_json, expires_at, resource)
         values (?, ?, ?, ?, ?)
         on conflict(token_hash) do update set
           client_id = excluded.client_id,
           scopes_json = excluded.scopes_json,
           expires_at = excluded.expires_at,
           resource = excluded.resource`,
      )
      .run(
        tokenHash,
        record.clientId,
        JSON.stringify(record.scopes),
        record.expiresAt,
        record.resource ?? null,
      );
  }

  saveTokenPair(pair: PersistedTokenPair, consumedRefreshTokenHash?: string): boolean {
    const save = this.database.sqlite.transaction(() => {
      if (consumedRefreshTokenHash) {
        const result = this.database.sqlite
          .prepare("delete from oauth_refresh_tokens where token_hash = ?")
          .run(consumedRefreshTokenHash);
        if (result.changes !== 1) return false;
      }

      this.saveAccessToken(pair.accessTokenHash, pair.accessToken);
      this.saveRefreshToken(pair.refreshTokenHash, pair.refreshToken);
      return true;
    });

    return save.immediate();
  }

  deleteRefreshToken(tokenHash: string): void {
    this.database.sqlite.prepare("delete from oauth_refresh_tokens where token_hash = ?").run(tokenHash);
  }

  revokeToken(tokenHash: string): void {
    this.deleteAccessToken(tokenHash);
    this.deleteRefreshToken(tokenHash);
  }

  getConsent(key: string): ConsentRecord | undefined {
    const row = this.database.sqlite
      .prepare("select client_id, redirect_uri, resource, scopes_json, approved_at from oauth_consents where consent_key = ?")
      .get(key) as {
        client_id: string;
        redirect_uri: string;
        resource: string;
        scopes_json: string;
        approved_at: number;
      } | undefined;
    return row
      ? {
          clientId: row.client_id,
          redirectUri: row.redirect_uri,
          resource: row.resource,
          scopes: JSON.parse(row.scopes_json) as string[],
          approvedAt: row.approved_at,
        }
      : undefined;
  }

  saveConsent(key: string, record: ConsentRecord): void {
    this.database.sqlite
      .prepare("insert or replace into oauth_consents (consent_key, client_id, redirect_uri, resource, scopes_json, approved_at) values (?, ?, ?, ?, ?, ?)")
      .run(
        key,
        record.clientId,
        record.redirectUri,
        record.resource,
        JSON.stringify(record.scopes),
        record.approvedAt,
      );
  }

  deleteClientConsents(clientId: string): void {
    this.database.sqlite.prepare("delete from oauth_consents where client_id = ?").run(clientId);
  }

  resetState(): void {
    this.database.sqlite.exec(`
      delete from oauth_authorization_codes;
      delete from oauth_access_tokens;
      delete from oauth_refresh_tokens;
      delete from oauth_consents;
    `);
  }

  close(): void {
    this.database.close();
  }

  private deleteExpired(): void {
    this.database.sqlite
      .prepare("delete from oauth_authorization_codes where expires_at_ms < ?")
      .run(Date.now());
    this.database.sqlite
      .prepare("delete from oauth_access_tokens where expires_at < ?")
      .run(Math.floor(Date.now() / 1000));
    this.database.sqlite
      .prepare("delete from oauth_refresh_tokens where expires_at < ?")
      .run(Math.floor(Date.now() / 1000));
  }

  private importLegacyState(statePath: string | undefined): void {
    if (!statePath || !existsSync(statePath)) return;

    let state: StoredOAuthState;
    try {
      const raw = readFileSync(statePath, "utf8");
      if (!raw.trim()) return;
      state = JSON.parse(raw) as StoredOAuthState;
    } catch {
      return;
    }

    const mtime = statSync(statePath).mtimeMs;
    const imported = this.database.sqlite
      .prepare("select value from oauth_metadata where key = ?")
      .get("legacy_json_import_mtime") as { value: string } | undefined;
    if (imported?.value === String(mtime)) return;

    const now = Math.floor(Date.now() / 1000);
    const transaction = this.database.sqlite.transaction(() => {
      for (const client of state.clients ?? []) {
        if (typeof client?.client_id !== "string") continue;
        this.saveClient(client);
      }
      for (const record of state.accessTokens ?? []) {
        if (!isStoredTokenRecord(record) || record.expiresAt < now) continue;
        this.saveAccessToken(record.tokenHash, {
          clientId: record.clientId,
          scopes: record.scopes,
          expiresAt: record.expiresAt,
          resource: record.resource,
        });
      }
      for (const record of state.refreshTokens ?? []) {
        if (!isStoredTokenRecord(record) || record.expiresAt < now) continue;
        this.saveRefreshToken(record.tokenHash, {
          clientId: record.clientId,
          scopes: record.scopes,
          expiresAt: record.expiresAt,
          resource: record.resource,
        });
      }
      for (const record of state.approvedConsents ?? []) {
        if (!isStoredConsentRecord(record)) continue;
        const scopes = normalizeScopes(record.scopes);
        this.saveConsent(consentKey(record.clientId, record.redirectUri, record.resource, scopes), {
          clientId: record.clientId,
          redirectUri: record.redirectUri,
          resource: record.resource,
          scopes,
          approvedAt: record.approvedAt,
        });
      }
      this.database.sqlite
        .prepare("insert or replace into oauth_metadata (key, value) values (?, ?)")
        .run("legacy_json_import_mtime", String(mtime));
    });
    transaction();
  }
}

export class SqliteOAuthClientsStore implements OAuthRegisteredClientsStore {
  constructor(
    private readonly store: SqliteOAuthStore,
    private readonly allowedRedirectHosts: string[],
  ) {}

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.store.getClient(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    if (!client.redirect_uris.every((uri) => redirectHostAllowed(String(uri), this.allowedRedirectHosts))) {
      throw new InvalidRequestError("Client redirect_uri is not allowed for this DevSpace server");
    }

    const now = Math.floor(Date.now() / 1000);
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: `devspace-${randomUUID()}`,
      client_id_issued_at: now,
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
      grant_types: client.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: client.response_types ?? ["code"],
    };
    this.store.saveClient(registered);
    return registered;
  }
}

export function consentKey(clientId: string, redirectUri: string, resource: string, scopes: string[]): string {
  return [clientId, redirectUri, resource, normalizeScopes(scopes).join(" ")].join("\n");
}

function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes)).sort();
}

function serializeAuthorizationParams(params: AuthorizationParams): string {
  return JSON.stringify({ ...params, resource: params.resource?.href });
}

function deserializeAuthorizationParams(value: string): AuthorizationParams {
  const parsed = JSON.parse(value) as SerializedAuthorizationParams;
  return {
    ...parsed,
    resource: parsed.resource ? new URL(parsed.resource) : undefined,
  };
}

function redirectHostAllowed(redirectUri: string, allowedHosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }

  if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return true;
  return allowedHosts.includes(parsed.hostname);
}

function isStoredTokenRecord(record: StoredTokenRecord): record is Required<Omit<StoredTokenRecord, "resource">> & { resource?: string } {
  return (
    typeof record?.tokenHash === "string" &&
    typeof record?.clientId === "string" &&
    Array.isArray(record?.scopes) &&
    typeof record?.expiresAt === "number"
  );
}

function isStoredConsentRecord(record: StoredConsentRecord): record is Required<StoredConsentRecord> {
  return (
    typeof record?.clientId === "string" &&
    typeof record?.redirectUri === "string" &&
    typeof record?.resource === "string" &&
    Array.isArray(record?.scopes) &&
    typeof record?.approvedAt === "number"
  );
}

function inferLegacyStatePath(path: string): string | undefined {
  return path.endsWith(".json") ? path : undefined;
}
