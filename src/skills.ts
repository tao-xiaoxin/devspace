import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkills,
  loadSkillsFromDir,
  type Skill,
  type LoadSkillsResult,
} from "@earendil-works/pi-coding-agent";
import type { ServerConfig } from "./config.js";
import { expandHomePath, isPathInsideRoot } from "./roots.js";

export type SkillSource = "system" | "local" | "installed" | "global";
export type SkillResolveMode = "read_only" | "normal";

export interface DevSpaceSkill extends Skill {
  source: SkillSource;
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

export function loadWorkspaceSkills(config: ServerConfig, cwd: string): LoadedSkills {
  if (!config.skillsEnabled) return { skills: [], diagnostics: [] };

  const batches: SkillBatch[] = [
    loadSkillsFromSourceDir(bundledSystemSkillPath(), "system"),
    loadSkillsFromSourceDir(legacyWorkspaceCorePath(cwd), "system", { legacyCore: true }),
    loadSkillsFromSourceDir(workspaceLocalSkillPath(cwd), "local"),
    loadSkillsFromSourceDir(workspaceInstalledSkillPath(cwd), "installed"),
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
  const skillName = alias === PLAN_ALIAS
    ? "create-plan"
    : alias === GOAL_ALIAS
      ? "define-goal"
      : lookup;

  const skill = skills.find((candidate) => {
    if (candidate.name === skillName) return true;
    return candidate.aliases?.includes(lookup) ?? false;
  });

  if (!skill) {
    throw new Error(`Skill not found: ${nameOrAlias}`);
  }

  return {
    name: skill.name,
    source: skill.source,
    path: resolve(skill.filePath),
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
    case "system":
      return "系统内置";
    case "local":
      return "项目自定义";
    case "installed":
      return "项目已安装";
    case "global":
      return "全局已安装";
  }
}

function bundledSystemSkillPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills", ".system");
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
  options: { legacyCore?: boolean } = {},
): SkillBatch {
  const loaded = loadSkillsFromDir({
    dir,
    source: source === "global" ? "user" : source,
  });

  const diagnostics = [...loaded.diagnostics];
  if (options.legacyCore && loaded.skills.length > 0) {
    diagnostics.push({
      type: "warning",
      message: `skills/core is deprecated; migrate these skills to skills/.system.`,
      path: dir,
    });
  }

  return {
    diagnostics,
    skills: loaded.skills.map((skill) => decorateSkill(skill, source, options)),
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
    skills: loaded.skills.map((skill) => decorateSkill(skill, "global")),
  };
}

function decorateSkill(
  skill: Skill,
  source: SkillSource,
  options: { legacyCore?: boolean } = {},
): DevSpaceSkill {
  return {
    ...skill,
    source,
    aliases: aliasesForSkill(skill.name),
    resolveMode: resolveModeForSkill(skill.name),
    legacyCore: options.legacyCore,
  };
}

function aliasesForSkill(name: string): string[] | undefined {
  if (name === "create-plan") return [PLAN_ALIAS];
  if (name === "define-goal") return [GOAL_ALIAS];
  return undefined;
}

function resolveModeForSkill(name: string): SkillResolveMode {
  return name === "create-plan" ? "read_only" : "normal";
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

  return {
    skills: Array.from(winners.values()),
    diagnostics,
  };
}

function normalizeSkillLookup(nameOrAlias: string): string {
  const trimmed = nameOrAlias.trim().replace(/^@\S+\s+/, "");
  if (trimmed.startsWith("/")) {
    return trimmed.split(/\s+/)[0] ?? trimmed;
  }

  return trimmed;
}
