import { mkdtemp, mkdir, opendir, readFile, readdir, rename, rm, stat, lstat, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { assertAllowedPath, isPathInsideRoot } from "./roots.js";
import type { ServerConfig } from "./config.js";
import { loadWorkspaceSkills, skillSourceLabel } from "./skills.js";

const execFileAsync = promisify(execFile);

export type SkillScope = "workspace" | "global";
export type SkillSourceType = "local" | "github" | "github_url";
export type InstalledSkillSourceType = "workspace-installed" | "global-installed";

export type SkillInstallSource =
  | {
      kind: "local";
      path: string;
    }
  | {
      kind: "github";
      repo: string;
      path: string;
      ref?: string;
      repoUrl?: string;
    }
  | {
      kind: "github_url";
      url: string;
    };

export interface InstalledSkillRecord {
  name: string;
  description: string;
  scope: SkillScope;
  path: string;
  removable: boolean;
  sourceType: InstalledSkillSourceType;
}

export interface InstalledSkillResult extends InstalledSkillRecord {
  sourceSummary: string;
}

export interface RemovedSkillResult {
  name: string;
  scope: SkillScope;
  removedPath: string;
}

interface GitRunner {
  (args: string[]): Promise<void>;
}

interface ParsedSkillMetadata {
  name: string;
  description: string;
  baseDir: string;
}

export async function installSkill(options: {
  config: ServerConfig;
  workspaceRoot?: string;
  scope: SkillScope;
  source: SkillInstallSource;
  githubBaseUrl?: string;
  localPathResolver?: (path: string) => string;
  runGit?: GitRunner;
}): Promise<InstalledSkillResult> {
  const sourceDir = await materializeSource(options.source, {
    githubBaseUrl: options.githubBaseUrl,
    localPathResolver: options.localPathResolver
      ?? ((path: string) => assertAllowedPath(path, options.config.allowedRoots)),
    runGit: options.runGit,
  });
  try {
    const metadata = await readSkillMetadata(sourceDir.path);
    const targetRoot = installRootForScope(options.config, options.workspaceRoot, options.scope);
    const targetPath = join(targetRoot, metadata.name);
    await mkdir(targetRoot, { recursive: true });
    await validateSkillTree(metadata.baseDir);
    await assertInstallConflicts(options.config, options.workspaceRoot, metadata.name, options.scope);

    await ensurePathMissing(targetPath, metadata.name, options.scope);
    const stagingPath = join(
      targetRoot,
      `.${metadata.name}.tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      await cp(metadata.baseDir, stagingPath, { recursive: true, errorOnExist: true, force: false });
      await rename(stagingPath, targetPath);
    } catch (error) {
      await rm(stagingPath, { recursive: true, force: true });
      throw error;
    }

    return {
      name: metadata.name,
      description: metadata.description,
      scope: options.scope,
      path: targetPath,
      removable: true,
      sourceType: options.scope === "workspace" ? "workspace-installed" : "global-installed",
      sourceSummary: sourceDir.summary,
    };
  } finally {
    await sourceDir.dispose();
  }
}

export async function removeInstalledSkill(options: {
  config: ServerConfig;
  workspaceRoot?: string;
  scope: SkillScope;
  name: string;
}): Promise<RemovedSkillResult> {
  validateSkillName(options.name);
  const targetRoot = installRootForScope(options.config, options.workspaceRoot, options.scope);
  const targetPath = resolve(targetRoot, options.name);
  if (!isPathInsideRoot(targetPath, targetRoot)) {
    throw new Error(`Refusing to remove skill outside installed root: ${options.name}`);
  }

  const targetStats = await safeStat(targetPath);
  if (!targetStats?.isDirectory()) {
    throw new Error(`Installed skill not found: ${options.name}`);
  }

  const metadata = await readSkillMetadata(targetPath);
  if (metadata.name !== options.name) {
    throw new Error(`Installed skill name mismatch for ${options.name}.`);
  }

  await rm(targetPath, { recursive: true, force: false });
  return {
    name: options.name,
    scope: options.scope,
    removedPath: targetPath,
  };
}

export async function listInstalledSkills(options: {
  config: ServerConfig;
  workspaceRoot?: string;
  scope: "workspace" | "global" | "all";
}): Promise<InstalledSkillRecord[]> {
  const scopes: SkillScope[] =
    options.scope === "all" ? ["workspace", "global"] : [options.scope];
  const collected = await Promise.all(
    scopes.map(async (scope) => listInstalledSkillsForScope(options.config, options.workspaceRoot, scope)),
  );

  return collected.flat().sort((a, b) => {
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
    return a.name.localeCompare(b.name);
  });
}

export function resolveWorkspaceRoot(config: ServerConfig, workspacePath: string): string {
  return assertAllowedPath(workspacePath, config.allowedRoots);
}

export function installRootForScope(
  config: ServerConfig,
  workspaceRoot: string | undefined,
  scope: SkillScope,
): string {
  if (scope === "global") {
    return resolve(config.agentDir, "skills");
  }

  if (!workspaceRoot) {
    throw new Error("workspaceRoot is required for workspace-scoped skill operations.");
  }

  return resolve(workspaceRoot, "skills", "installed");
}

async function listInstalledSkillsForScope(
  config: ServerConfig,
  workspaceRoot: string | undefined,
  scope: SkillScope,
): Promise<InstalledSkillRecord[]> {
  const root = installRootForScope(config, workspaceRoot, scope);
  const rootStats = await safeStat(root);
  if (!rootStats?.isDirectory()) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const records: InstalledSkillRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(root, entry.name);
    const metadata = await safeReadSkillMetadata(skillDir);
    if (!metadata) continue;
    records.push({
      name: metadata.name,
      description: metadata.description,
      scope,
      path: skillDir,
      removable: true,
      sourceType: scope === "workspace" ? "workspace-installed" : "global-installed",
    });
  }

  return records;
}

async function readSkillMetadata(skillDir: string): Promise<ParsedSkillMetadata> {
  const skillFile = join(skillDir, "SKILL.md");
  const content = await readFile(skillFile, "utf8").catch(() => {
    throw new Error(`Skill directory is missing SKILL.md: ${skillDir}`);
  });
  const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
  const name = String(frontmatter.name ?? "").trim();
  const description = String(frontmatter.description ?? "").trim();

  if (!name) {
    throw new Error(`Skill frontmatter is missing name: ${skillFile}`);
  }
  if (!description) {
    throw new Error(`Skill frontmatter is missing description: ${skillFile}`);
  }

  validateSkillName(name);
  if (basename(skillDir) !== name) {
    throw new Error(`Skill directory name must match frontmatter name: ${skillDir}`);
  }

  return {
    name,
    description,
    baseDir: skillDir,
  };
}

async function safeReadSkillMetadata(skillDir: string): Promise<ParsedSkillMetadata | null> {
  try {
    return await readSkillMetadata(skillDir);
  } catch {
    return null;
  }
}

async function ensurePathMissing(targetPath: string, skillName: string, scope: SkillScope): Promise<void> {
  const existing = await safeStat(targetPath);
  if (existing) {
    throw new Error(`Installed skill already exists in ${scope} scope: ${skillName}`);
  }
}

function validateSkillName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid skill name: ${name}`);
  }
}

async function validateSkillTree(root: string): Promise<void> {
  const entries = await opendir(root);
  for await (const entry of entries) {
    const path = join(root, entry.name);
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`Skill directory contains unsupported symlink: ${path}`);
    }
    if (stats.isDirectory()) {
      await validateSkillTree(path);
    }
  }
}

async function assertInstallConflicts(
  config: ServerConfig,
  workspaceRoot: string | undefined,
  skillName: string,
  scope: SkillScope,
): Promise<void> {
  if (!workspaceRoot) return;

  const loaded = loadWorkspaceSkills(config, workspaceRoot);
  const existing = loaded.skills.find((skill) => skill.name === skillName);
  if (!existing) return;

  if (existing.source === "devspace_system" || existing.source === "local") {
    throw new Error(
      `Skill ${skillName} conflicts with an existing ${skillSourceLabel(existing.source)} skill.`,
    );
  }

  if (
    (scope === "workspace" && existing.source === "installed") ||
    (scope === "global" && existing.source === "global")
  ) {
    throw new Error(
      `Skill ${skillName} already exists in ${scope === "workspace" ? "项目已安装" : "全局已安装"} source.`,
    );
  }
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function materializeSource(
  source: SkillInstallSource,
  options: {
    githubBaseUrl?: string;
    localPathResolver?: (path: string) => string;
    runGit?: GitRunner;
  },
): Promise<{
  path: string;
  summary: string;
  dispose: () => Promise<void>;
}> {
  if (source.kind === "local") {
    const resolvedPath = options.localPathResolver ? options.localPathResolver(source.path) : resolve(source.path);
    return {
      path: resolvedPath,
      summary: `local:${resolvedPath}`,
      dispose: async () => {},
    };
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "devspace-skill-"));
  const checkoutRoot = join(tempRoot, "repo");
  const parsed = source.kind === "github_url" ? parseGithubTreeUrl(source.url) : source;
  validateRelativeSkillPath(parsed.path);
  const repoBaseUrl = options.githubBaseUrl ?? "https://github.com/";
  const repoUrl = parsed.repoUrl ?? new URL(`${parsed.repo}.git`, repoBaseUrl).toString();
  const ref = parsed.ref ?? "main";
  const runGit = options.runGit ?? ((args: string[]) => execFileAsync("git", args).then(() => undefined));

  try {
    await runGit(["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", ref, repoUrl, checkoutRoot]);
    await runGit(["-C", checkoutRoot, "sparse-checkout", "set", "--no-cone", parsed.path]);
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw new Error(
      `Failed to fetch GitHub skill from ${parsed.repo}:${parsed.path}${parsed.ref ? `@${parsed.ref}` : ""}.`,
    );
  }

  const skillDir = join(checkoutRoot, parsed.path);
  return {
    path: skillDir,
    summary: `github:${parsed.repo}/${parsed.path}${parsed.ref ? `@${parsed.ref}` : ""}`,
    dispose: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export function parseGithubTreeUrl(url: string): { repo: string; path: string; ref?: string; repoUrl?: string } {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") {
    throw new Error(`Unsupported GitHub URL host: ${parsed.hostname}`);
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "tree") {
    throw new Error(`Unsupported GitHub tree URL: ${url}`);
  }

  return {
    repo: `${parts[0]}/${parts[1]}`,
    ref: parts[3],
    path: parts.slice(4).join("/"),
  };
}

function validateRelativeSkillPath(path: string): void {
  const normalized = path.trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Invalid skill path: ${path}`);
  }
}
