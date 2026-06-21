import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkills,
  loadSkillsFromDir,
  type Skill,
  type LoadSkillsResult,
} from "@earendil-works/pi-coding-agent";
import type { ServerConfig } from "./config.js";
import { expandHomePath, isPathInsideRoot } from "./roots.js";

export type SkillSource =
  | "devspace_system"
  | "local"
  | "legacy_core"
  | "installed"
  | "official_vendored"
  | "global";
export type SkillResolveMode = "read_only" | "normal";

export interface DevSpaceSkill extends Skill {
  source: SkillSource;
  qualifiedId: string;
  locator: string;
  aliases?: string[];
  resolveMode: SkillResolveMode;
  legacyCore?: boolean;
}

export interface LoadedSkills {
  skills: DevSpaceSkill[];
  diagnostics: LoadSkillsResult["diagnostics"];
}

export interface SkillReadResolution {
  absolutePath: string;
  skill: DevSpaceSkill;
  isSkillFile: boolean;
}

export interface ResolvedSkillDefinition {
  name: string;
  qualifiedId: string;
  source: SkillSource;
  path: string;
  alias?: string;
  mode: SkillResolveMode;
  instructions: string;
  skill: DevSpaceSkill;
}

interface SkillBatch {
  skills: DevSpaceSkill[];
  diagnostics: LoadSkillsResult["diagnostics"];
}

interface SkillSourceOptions {
  legacyCore?: boolean;
  qualifiedPrefix?: string;
}

const PLAN_ALIAS = "/plan";
const GOAL_ALIAS = "/goal";

export function loadWorkspaceSkills(config: ServerConfig, cwd: string): LoadedSkills {
  if (!config.skillsEnabled) return { skills: [], diagnostics: [] };

  const batches: SkillBatch[] = [
    ...loadDevSpaceSystemSkillBatches(),
    loadSkillsFromSourceDir(workspaceLocalSkillPath(cwd), "local"),
    loadSkillsFromSourceDir(legacyWorkspaceCorePath(cwd), "legacy_core", { legacyCore: true }),
    loadSkillsFromSourceDir(workspaceInstalledSkillPath(cwd), "installed"),
    ...loadOfficialVendoredSkillBatches(),
    loadSkillsFromSourceDir(globalSkillPath(config.agentDir), "global"),
    loadExplicitSkillPaths(config, cwd),
  ];

  return mergeLoadedSkills(batches);
}

export async function resolveSkillDefinition(
  skills: DevSpaceSkill[],
  nameOrAlias: string,
): Promise<ResolvedSkillDefinition> {
  const lookup = normalizeSkillLookup(nameOrAlias);
  const alias = lookup === PLAN_ALIAS || lookup === GOAL_ALIAS ? lookup : undefined;
  const fixedName = alias === PLAN_ALIAS
    ? "devspace-plan"
    : alias === GOAL_ALIAS
      ? "devspace-goal"
      : lookup;

  const skill = alias
    ? skills.find((candidate) => candidate.name === fixedName && candidate.source === "devspace_system")
    : skills.find((candidate) => candidate.qualifiedId === fixedName)
      ?? skills.find((candidate) => candidate.name === fixedName);

  if (!skill) {
    throw new Error(`Skill not found: ${nameOrAlias}`);
  }

  return {
    name: skill.name,
    qualifiedId: skill.qualifiedId,
    source: skill.source,
    path: skill.locator,
    alias,
    mode: skill.resolveMode,
    instructions: await readFile(skill.filePath, "utf8"),
    skill,
  };
}

export function resolveSkillReadPath(
  skills: DevSpaceSkill[],
  activatedSkillDirs: Set<string>,
  inputPath: string,
): SkillReadResolution | undefined {
  const locatorMatch = resolveLocatorReadPath(skills, activatedSkillDirs, inputPath);
  if (locatorMatch) return locatorMatch;

  const absolutePath = resolve(expandHomePath(inputPath));

  for (const skill of skills) {
    const skillFilePath = resolve(skill.filePath);
    if (absolutePath === skillFilePath) {
      return { absolutePath, skill, isSkillFile: true };
    }
  }

  for (const skill of skills) {
    const baseDir = resolve(skill.baseDir);
    if (!activatedSkillDirs.has(baseDir)) continue;
    if (!isPathInsideRoot(absolutePath, baseDir)) continue;

    return { absolutePath, skill, isSkillFile: false };
  }

  return undefined;
}

export function markSkillActivated(
  activatedSkillDirs: Set<string>,
  skill: DevSpaceSkill,
): void {
  activatedSkillDirs.add(resolve(skill.baseDir));
}

export function formatPathForPrompt(path: string): string {
  const home = resolve(homedir());
  const resolvedPath = resolve(path);

  if (resolvedPath === home) return "~";
  if (resolvedPath.startsWith(`${home}${sep}`)) {
    return `~/${resolvedPath.slice(home.length + 1).split(sep).join("/")}`;
  }

  return resolvedPath.split(sep).join("/");
}

export function skillSourceLabel(source: SkillSource): string {
  switch (source) {
    case "devspace_system":
      return "DevSpace 核心";
    case "local":
      return "项目自定义";
    case "legacy_core":
      return "项目 legacy core";
    case "installed":
      return "项目已安装";
    case "official_vendored":
      return "OpenAI 官方副本";
    case "global":
      return "全局已安装";
  }
}

function loadDevSpaceSystemSkillBatches(): SkillBatch[] {
  const root = bundledSystemSkillPath();
  if (!existsSync(root)) return [];

  const coreDirectories = new Set([
    "devspace-plan",
    "devspace-goal",
    "devspace-workflow",
    "senior-architect",
    "skill-authoring",
  ]);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && coreDirectories.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => loadSkillsFromSourceDir(resolve(root, entry.name), "devspace_system"));
}

function loadOfficialVendoredSkillBatches(): SkillBatch[] {
  const root = officialVendoredSkillsPath();
  const channels = [".system", ".curated", ".experimental"];
  return channels.map((channel) =>
    loadSkillsFromSourceDir(resolve(root, channel), "official_vendored", {
      qualifiedPrefix: `openai:${channel}`,
    }),
  );
}

function bundledSystemSkillPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills", ".system");
}

function officialVendoredSkillsPath(): string {
  return resolve(bundledSystemSkillPath(), "openai", "skills");
}

function legacyWorkspaceCorePath(cwd: string): string {
  return resolve(cwd, "skills", "core");
}

function workspaceLocalSkillPath(cwd: string): string {
  return resolve(cwd, "skills", "local");
}

function workspaceInstalledSkillPath(cwd: string): string {
  return resolve(cwd, "skills", "installed");
}

function globalSkillPath(agentDir: string): string {
  return resolve(agentDir, "skills");
}

function loadSkillsFromSourceDir(
  dir: string,
  source: SkillSource,
  options: SkillSourceOptions = {},
): SkillBatch {
  if (!existsSync(dir)) return { skills: [], diagnostics: [] };

  const loaded = loadSkillsFromDir({
    dir,
    source: source === "global" ? "user" : "system",
  });

  const diagnostics = [...loaded.diagnostics];
  if (options.legacyCore && loaded.skills.length > 0) {
    diagnostics.push({
      type: "warning",
      message: "skills/core is deprecated; migrate these skills to skills/local or skills/installed.",
      path: dir,
    });
  }

  return {
    diagnostics,
    skills: loaded.skills.map((skill) => decorateSkill(skill, source, dir, options)),
  };
}

function loadExplicitSkillPaths(config: ServerConfig, cwd: string): SkillBatch {
  if (config.skillPaths.length === 0) {
    return { skills: [], diagnostics: [] };
  }

  const loaded = loadSkills({
    cwd,
    agentDir: config.agentDir,
    skillPaths: config.skillPaths,
    includeDefaults: false,
  });

  return {
    diagnostics: loaded.diagnostics,
    skills: loaded.skills.map((skill) => decorateSkill(skill, "global", dirname(skill.filePath))),
  };
}

function decorateSkill(
  skill: Skill,
  source: SkillSource,
  sourceRoot: string,
  options: SkillSourceOptions = {},
): DevSpaceSkill {
  const relativePath = relative(sourceRoot, skill.baseDir).split(sep).join("/");
  const qualifiedId = options.qualifiedPrefix
    ? `${options.qualifiedPrefix}/${relativePath || skill.name}`
    : skill.name;
  const locator = skillLocator(source, qualifiedId);

  return {
    ...skill,
    source,
    qualifiedId,
    locator,
    aliases: aliasesForSkill(skill.name, source),
    resolveMode: resolveModeForSkill(skill.name),
    legacyCore: options.legacyCore,
  };
}

function aliasesForSkill(name: string, source: SkillSource): string[] | undefined {
  if (source !== "devspace_system") return undefined;
  if (name === "devspace-plan") return [PLAN_ALIAS];
  if (name === "devspace-goal") return [GOAL_ALIAS];
  return undefined;
}

function resolveModeForSkill(name: string): SkillResolveMode {
  return name === "devspace-plan" ? "read_only" : "normal";
}

function mergeLoadedSkills(batches: SkillBatch[]): LoadedSkills {
  const winners = new Map<string, DevSpaceSkill>();
  const diagnostics: LoadSkillsResult["diagnostics"] = [];

  for (const batch of batches) {
    diagnostics.push(...batch.diagnostics);
    for (const skill of batch.skills) {
      const key = skill.source === "official_vendored" ? skill.qualifiedId : skill.name;
      const existing = winners.get(key);
      if (!existing) {
        winners.set(key, skill);
        continue;
      }

      diagnostics.push({
        type: "collision",
        message: `name "${skill.name}" collision (${skillSourceLabel(existing.source)} wins over ${skillSourceLabel(skill.source)})`,
        path: skill.filePath,
        collision: {
          resourceType: "skill",
          name: skill.name,
          winnerPath: existing.filePath,
          loserPath: skill.filePath,
        },
      });
    }
  }

  return {
    skills: Array.from(winners.values()),
    diagnostics,
  };
}

function resolveLocatorReadPath(
  skills: DevSpaceSkill[],
  activatedSkillDirs: Set<string>,
  inputPath: string,
): SkillReadResolution | undefined {
  if (!inputPath.startsWith("skill://")) return undefined;

  for (const skill of skills) {
    if (inputPath === skill.locator) {
      return { absolutePath: resolve(skill.filePath), skill, isSkillFile: true };
    }

    const prefix = `${skill.locator.slice(0, -"SKILL.md".length)}`;
    if (!inputPath.startsWith(prefix)) continue;
    if (!activatedSkillDirs.has(resolve(skill.baseDir))) continue;

    const relativePath = inputPath.slice(prefix.length);
    if (!relativePath || relativePath === "SKILL.md") {
      return { absolutePath: resolve(skill.filePath), skill, isSkillFile: true };
    }
    const absolutePath = resolve(skill.baseDir, relativePath);
    if (!isPathInsideRoot(absolutePath, resolve(skill.baseDir))) return undefined;
    return { absolutePath, skill, isSkillFile: false };
  }

  return undefined;
}

function skillLocator(source: SkillSource, qualifiedId: string): string {
  const namespace = source === "devspace_system"
    ? "devspace-system"
    : source === "official_vendored"
      ? "official-vendored"
      : source;
  return `skill://${namespace}/${qualifiedId}/SKILL.md`;
}

function normalizeSkillLookup(nameOrAlias: string): string {
  const trimmed = nameOrAlias.trim().replace(/^@\S+\s+/, "");
  if (trimmed.startsWith("/")) {
    return trimmed.split(/\s+/)[0] ?? trimmed;
  }
  return trimmed;
}
