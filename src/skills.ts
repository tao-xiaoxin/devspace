import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkills,
  loadSkillsFromDir,
  type LoadSkillsResult,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { ServerConfig } from "./config.js";
import { expandHomePath, isPathInsideRoot } from "./roots.js";

export type SkillSource = "devspace_system" | "local" | "installed" | "global";
export type SkillResolveMode = "read_only" | "normal";

export interface DevSpaceSkill extends Skill {
  source: SkillSource;
  qualifiedId: string;
  locator: string;
  aliases?: string[];
  resolveMode: SkillResolveMode;
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

const PLAN_ALIAS = "/plan";
const GOAL_ALIAS = "/goal";
const SYSTEM_SKILL_NAMES = [
  "plan",
  "goal",
  "workflow",
  "architecture-review",
  "skill-authoring",
] as const;

export function loadWorkspaceSkills(config: ServerConfig, cwd: string): LoadedSkills {
  if (!config.skillsEnabled) return { skills: [], diagnostics: [] };

  return mergeLoadedSkills([
    ...loadDevSpaceSystemSkillBatches(),
    loadSkillsFromSourceDir(workspaceLocalSkillPath(cwd), "local"),
    loadSkillsFromSourceDir(workspaceInstalledSkillPath(cwd), "installed"),
    loadSkillsFromSourceDir(globalSkillPath(config.agentDir), "global"),
    loadExplicitSkillPaths(config, cwd),
  ]);
}

export async function resolveSkillDefinition(
  skills: DevSpaceSkill[],
  nameOrAlias: string,
): Promise<ResolvedSkillDefinition> {
  const lookup = normalizeSkillLookup(nameOrAlias);
  const alias = lookup === PLAN_ALIAS || lookup === GOAL_ALIAS ? lookup : undefined;
  const fixedName = alias === PLAN_ALIAS
    ? "plan"
    : alias === GOAL_ALIAS
      ? "goal"
      : lookup;

  const skill = alias
    ? skills.find((candidate) => candidate.name === fixedName && candidate.source === "devspace_system")
    : skills.find((candidate) => candidate.qualifiedId === fixedName)
      ?? skills.find((candidate) => candidate.name === fixedName);

  if (!skill) throw new Error(`Skill not found: ${nameOrAlias}`);

  return {
    name: skill.name,
    qualifiedId: skill.qualifiedId,
    source: skill.source,
    path: skill.locator,
    alias,
    mode: fixedName === "plan" && skill.source === "devspace_system" ? "read_only" : skill.resolveMode,
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
    if (absolutePath === resolve(skill.filePath)) {
      return { absolutePath, skill, isSkillFile: true };
    }
  }

  for (const skill of skills) {
    const baseDir = resolve(skill.baseDir);
    if (!activatedSkillDirs.has(baseDir) || !isPathInsideRoot(absolutePath, baseDir)) continue;
    return { absolutePath, skill, isSkillFile: false };
  }

  return undefined;
}

export function markSkillActivated(activatedSkillDirs: Set<string>, skill: DevSpaceSkill): void {
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
      return "DevSpace 系统";
    case "local":
      return "项目自定义";
    case "installed":
      return "项目已安装";
    case "global":
      return "全局已安装";
  }
}

function loadDevSpaceSystemSkillBatches(): SkillBatch[] {
  const root = bundledSystemSkillPath();
  return SYSTEM_SKILL_NAMES.map((name) => loadSkillsFromSourceDir(resolve(root, name), "devspace_system"));
}

function bundledSystemSkillPath(): string {
  return resolve(fileURLToPath(new URL("../skills/.system", import.meta.url)));
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

function loadSkillsFromSourceDir(dir: string, source: SkillSource): SkillBatch {
  if (!existsSync(dir)) return { skills: [], diagnostics: [] };
  const loaded = loadSkillsFromDir({
    dir,
    source: source === "global" ? "user" : "system",
  });
  return {
    diagnostics: [...loaded.diagnostics],
    skills: loaded.skills.map((skill) => decorateSkill(skill, source)),
  };
}

function loadExplicitSkillPaths(config: ServerConfig, cwd: string): SkillBatch {
  if (config.skillPaths.length === 0) return { skills: [], diagnostics: [] };
  const loaded = loadSkills({
    cwd,
    agentDir: config.agentDir,
    skillPaths: config.skillPaths,
    includeDefaults: false,
  });
  return {
    diagnostics: loaded.diagnostics,
    skills: loaded.skills.map((skill) => decorateSkill(skill, "global")),
  };
}

function decorateSkill(skill: Skill, source: SkillSource): DevSpaceSkill {
  return {
    ...skill,
    source,
    qualifiedId: skill.name,
    locator: skillLocator(source, skill.name),
    aliases: aliasesForSkill(skill.name, source),
    resolveMode: skill.name === "plan" && source === "devspace_system" ? "read_only" : "normal",
  };
}

function aliasesForSkill(name: string, source: SkillSource): string[] | undefined {
  if (source !== "devspace_system") return undefined;
  if (name === "plan") return [PLAN_ALIAS];
  if (name === "goal") return [GOAL_ALIAS];
  return undefined;
}

function mergeLoadedSkills(batches: SkillBatch[]): LoadedSkills {
  const winners = new Map<string, DevSpaceSkill>();
  const diagnostics: LoadSkillsResult["diagnostics"] = [];

  for (const batch of batches) {
    diagnostics.push(...batch.diagnostics);
    for (const skill of batch.skills) {
      const existing = winners.get(skill.name);
      if (!existing) {
        winners.set(skill.name, skill);
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

  return { skills: Array.from(winners.values()), diagnostics };
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

    const prefix = skill.locator.slice(0, -"SKILL.md".length);
    if (!inputPath.startsWith(prefix) || !activatedSkillDirs.has(resolve(skill.baseDir))) continue;

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

function skillLocator(source: SkillSource, name: string): string {
  const namespace = source === "devspace_system" ? "devspace-system" : source;
  return `skill://${namespace}/${name}/SKILL.md`;
}

function normalizeSkillLookup(nameOrAlias: string): string {
  const trimmed = nameOrAlias.trim().replace(/^@\S+\s+/, "");
  return trimmed.startsWith("/") ? (trimmed.split(/\s+/)[0] ?? trimmed) : trimmed;
}
