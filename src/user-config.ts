import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { expandHomePath } from "./roots.js";

export type TunnelMode = "cloudflare";

export interface DevspaceServerUserConfig {
  host?: string;
  port?: number;
  mcpPath?: string;
  publicBaseUrl?: string | null;
}

export interface DevspaceWorkspacesUserConfig {
  allowed?: string[];
  default?: string | null;
}

export interface DevspaceServiceUserConfig {
  manager?: string;
  autostart?: boolean;
}

export interface DevspaceUserConfig {
  host?: string;
  port?: number;
  allowedRoots?: string[];
  publicBaseUrl?: string | null;
  allowedHosts?: string[];
  stateDir?: string;
  worktreeRoot?: string;
  agentDir?: string;
  tunnel?: TunnelMode;
  server?: DevspaceServerUserConfig;
  workspaces?: DevspaceWorkspacesUserConfig;
  service?: DevspaceServiceUserConfig;
  allowedDirectories?: string[];
  publicUrl?: string | null;
  baseUrl?: string | null;
}

export interface DevspaceAuthConfig {
  ownerToken?: string;
}

export interface DevspaceFiles {
  dir: string;
  configPath: string;
  authPath: string;
  configExists: boolean;
  authExists: boolean;
  config: DevspaceUserConfig;
  auth: DevspaceAuthConfig;
}

export function devspaceConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(expandHomePath(env.DEVSPACE_CONFIG_DIR ?? join(homedir(), ".devspace")));
}

export function devspaceConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(devspaceConfigDir(env), "config.json");
}

export function devspaceAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(devspaceConfigDir(env), "auth.json");
}

export function loadDevspaceFiles(env: NodeJS.ProcessEnv = process.env): DevspaceFiles {
  const dir = devspaceConfigDir(env);
  const configPath = join(dir, "config.json");
  const authPath = join(dir, "auth.json");
  const configExists = existsSync(configPath);
  const authExists = existsSync(authPath);

  return {
    dir,
    configPath,
    authPath,
    configExists,
    authExists,
    config: configExists ? normalizeDevspaceUserConfig(readJsonFile<DevspaceUserConfig>(configPath)) : {},
    auth: authExists ? readJsonFile<DevspaceAuthConfig>(authPath) : {},
  };
}

export function writeDevspaceConfig(
  config: DevspaceUserConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const filePath = devspaceConfigPath(env);
  mkdirSync(devspaceConfigDir(env), { recursive: true });
  writeJsonFile(filePath, serializeDevspaceUserConfig(config), 0o600);
  return filePath;
}

export function writeDevspaceAuth(
  auth: DevspaceAuthConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const filePath = devspaceAuthPath(env);
  mkdirSync(devspaceConfigDir(env), { recursive: true });
  writeJsonFile(filePath, auth, 0o600);
  return filePath;
}

export function generateOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

function readJsonFile<T>(filePath: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${filePath}: ${reason}`);
  }
}

function writeJsonFile(filePath: string, value: unknown, mode: number): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.tmp`;

  try {
    writeFileSync(tempPath, JSON.stringify(value, null, 2) + "\n", { mode });
    renameSync(tempPath, filePath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function normalizeDevspaceUserConfig(raw: DevspaceUserConfig): DevspaceUserConfig {
  const normalizedRoots = normalizePathList(
    raw.workspaces?.allowed ?? raw.allowedRoots ?? raw.allowedDirectories,
  );
  const defaultWorkspace = normalizeOptionalPath(raw.workspaces?.default);
  const splitUrl = splitConfiguredPublicUrl(
    raw.server?.publicBaseUrl ?? raw.publicBaseUrl ?? raw.publicUrl ?? raw.baseUrl ?? null,
    raw.server?.mcpPath,
  );
  const server: DevspaceServerUserConfig = {
    host: raw.server?.host ?? raw.host,
    port: raw.server?.port ?? raw.port,
    mcpPath: splitUrl.mcpPath,
    publicBaseUrl: splitUrl.publicBaseUrl,
  };

  return {
    ...raw,
    host: server.host,
    port: server.port,
    allowedRoots: normalizedRoots,
    publicBaseUrl: server.publicBaseUrl,
    server,
    workspaces: {
      allowed: normalizedRoots,
      default: defaultWorkspace,
    },
    service: {
      manager: raw.service?.manager,
      autostart: raw.service?.autostart,
    },
  };
}

export function normalizeMcpPath(path: string | undefined): string {
  const trimmed = path?.trim();
  if (!trimmed) return "/mcp";
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+$/, "") || "/mcp";
}

export function splitConfiguredPublicUrl(
  value: string | null | undefined,
  explicitMcpPath?: string,
): {
  publicBaseUrl: string | null;
  mcpPath: string;
} {
  const fallbackPath = normalizeMcpPath(explicitMcpPath);
  const trimmed = value?.trim();
  if (!trimmed) {
    return {
      publicBaseUrl: null,
      mcpPath: fallbackPath,
    };
  }

  const parsed = new URL(trimmed);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = "";

  return {
    publicBaseUrl: parsed.toString().replace(/\/$/, ""),
    mcpPath: normalizeMcpPath(pathname || fallbackPath),
  };
}

export function serializeDevspaceUserConfig(config: DevspaceUserConfig): DevspaceUserConfig {
  const normalized = normalizeDevspaceUserConfig(config);
  return {
    host: normalized.server?.host,
    port: normalized.server?.port,
    allowedRoots: normalized.workspaces?.allowed,
    publicBaseUrl: normalized.server?.publicBaseUrl ?? null,
    allowedHosts: normalized.allowedHosts,
    stateDir: normalized.stateDir,
    worktreeRoot: normalized.worktreeRoot,
    agentDir: normalized.agentDir,
    tunnel: normalized.tunnel,
    server: {
      host: normalized.server?.host,
      port: normalized.server?.port,
      mcpPath: normalized.server?.mcpPath,
      publicBaseUrl: normalized.server?.publicBaseUrl ?? null,
    },
    workspaces: {
      allowed: normalized.workspaces?.allowed,
      default: normalized.workspaces?.default ?? null,
    },
    service: {
      manager: normalized.service?.manager,
      autostart: normalized.service?.autostart,
    },
  };
}

function normalizePathList(paths: string[] | undefined): string[] | undefined {
  const normalized = paths
    ?.map((path) => normalizeOptionalPath(path))
    .filter((path): path is string => Boolean(path));
  if (!normalized || normalized.length === 0) return undefined;
  return Array.from(new Set(normalized));
}

function normalizeOptionalPath(path: string | null | undefined): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) return undefined;
  return resolve(expandHomePath(trimmed));
}
