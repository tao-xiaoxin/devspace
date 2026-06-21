import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
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
  resource?: URL;
}

export interface ConsentRecord {
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  approvedAt: number;
}

type TokenKind = "access" | "refresh";

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

  constructor(statePath: string | undefined) {
    this.database = openDatabase(statePath ? dirname(statePath) : process.cwd());
    this.migrate();
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
      .prepare("insert or replace into oauth_authorization_codes (code_hash, client_id, params_json, expires_at_ms) values (?, ?, ?, ?)")
      .run(codeHash, record.clientId, serializeAuthorizationParams(record.params), record.expiresAtMs);
  }

  deleteAuthorizationCode(codeHash: string): void {
    this.database.sqlite
      .prepare("delete from oauth_authorization_codes where code_hash = ?")
      .run(codeHash);
  }

  getAccessToken(tokenHash: string): TokenRecord | undefined {
    return this.getToken("access", tokenHash);
  }

  saveAccessToken(tokenHash: string, record: TokenRecord): void {
    this.saveToken("access", tokenHash, record);
  }

  deleteAccessToken(tokenHash: string): void {
    this.deleteToken("access", tokenHash);
  }

  getRefreshToken(tokenHash: string): TokenRecord | undefined {
    return this.getToken("refresh", tokenHash);
  }

  saveRefreshToken(tokenHash: string, record: TokenRecord): void {
    this.saveToken("refresh", tokenHash, record);
  }

  deleteRefreshToken(tokenHash: string): void {
    this.deleteToken("refresh", tokenHash);
  }

  revokeToken(tokenHash: string): void {
    this.database.sqlite
      .prepare("delete from oauth_tokens where token_hash = ?")
      .run(tokenHash);
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
      .run(key, record.clientId, record.redirectUri, record.resource, JSON.stringify(record.scopes), record.approvedAt);
  }

  deleteClientConsents(clientId: string): void {
    this.database.sqlite
      .prepare("delete from oauth_consents where client_id = ?")
      .run(clientId);
  }

  resetState(): void {
    this.database.sqlite.exec(`
      delete from oauth_authorization_codes;
      delete from oauth_tokens;
      delete from oauth_consents;
    `);
  }

  close(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.sqlite.exec(`
      create table if not exists oauth_clients (
        client_id text primary key,
        client_json text not null,
        created_at integer not null
      );
      create table if not exists oauth_authorization_codes (
        code_hash text primary key,
        client_id text not null,
        params_json text not null,
        expires_at_ms integer not null,
        foreign key (client_id) references oauth_clients(client_id) on delete cascade
      );
      create index if not exists oauth_authorization_codes_expiry_idx
        on oauth_authorization_codes(expires_at_ms);
      create table if not exists oauth_tokens (
        token_hash text not null,
        token_kind text not null,
        client_id text not null,
        scopes_json text not null,
        expires_at integer not null,
        resource text,
        primary key (token_hash, token_kind),
        foreign key (client_id) references oauth_clients(client_id) on delete cascade
      );
      create index if not exists oauth_tokens_expiry_idx on oauth_tokens(expires_at);
      create table if not exists oauth_consents (
        consent_key text primary key,
        client_id text not null,
        redirect_uri text not null,
        resource text not null,
        scopes_json text not null,
        approved_at integer not null,
        foreign key (client_id) references oauth_clients(client_id) on delete cascade
      );
      create index if not exists oauth_consents_client_idx on oauth_consents(client_id);
      create table if not exists oauth_metadata (
        key text primary key,
        value text not null
      );
    `);
  }

  private deleteExpired(): void {
    this.database.sqlite
      .prepare("delete from oauth_authorization_codes where expires_at_ms < ?")
      .run(Date.now());
    this.database.sqlite
      .prepare("delete from oauth_tokens where expires_at < ?")
      .run(Math.floor(Date.now() / 1000));
  }

  private getToken(kind: TokenKind, tokenHash: string): TokenRecord | undefined {
    const row = this.database.sqlite
      .prepare("select client_id, scopes_json, expires_at, resource from oauth_tokens where token_hash = ? and token_kind = ?")
      .get(tokenHash, kind) as {
        client_id: string;
        scopes_json: string;
        expires_at: number;
        resource: string | null;
      } | undefined;
    if (!row) return undefined;
    if (row.expires_at < Math.floor(Date.now() / 1000)) {
      this.deleteToken(kind, tokenHash);
      return undefined;
    }
    return {
      clientId: row.client_id,
      scopes: JSON.parse(row.scopes_json) as string[],
      expiresAt: row.expires_at,
      resource: row.resource ? parseStoredResource(row.resource) : undefined,
    };
  }

  private saveToken(kind: TokenKind, tokenHash: string, record: TokenRecord): void {
    this.database.sqlite
      .prepare("insert or replace into oauth_tokens (token_hash, token_kind, client_id, scopes_json, expires_at, resource) values (?, ?, ?, ?, ?, ?)")
      .run(tokenHash, kind, record.clientId, JSON.stringify(record.scopes), record.expiresAt, record.resource?.href ?? null);
  }

  private deleteToken(kind: TokenKind, tokenHash: string): void {
    this.database.sqlite
      .prepare("delete from oauth_tokens where token_hash = ? and token_kind = ?")
      .run(tokenHash, kind);
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
          resource: parseStoredResource(record.resource),
        });
      }
      for (const record of state.refreshTokens ?? []) {
        if (!isStoredTokenRecord(record) || record.expiresAt < now) continue;
        this.saveRefreshToken(record.tokenHash, {
          clientId: record.clientId,
          scopes: record.scopes,
          expiresAt: record.expiresAt,
          resource: parseStoredResource(record.resource),
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

function parseStoredResource(resource: string | undefined): URL | undefined {
  if (!resource) return undefined;
  try {
    return new URL(resource);
  } catch {
    return undefined;
  }
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
