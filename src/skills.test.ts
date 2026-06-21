import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";
import {
  formatPathForPrompt,
  loadWorkspaceSkills,
  resolveSkillDefinition,
  resolveSkillReadPath,
} from "./skills.js";

const root = await mkdtemp(join(tmpdir(), "devspace-skills-test-"));

try {
  const projectRoot = join(root, "project");
  const agentDir = join(root, "agent");
  const explicitSkills = join(root, "explicit-skills");
  await mkdir(join(projectRoot, "skills", "local", "project-skill"), { recursive: true });
  await mkdir(join(projectRoot, "skills", "installed", "installed-skill"), { recursive: true });
  await mkdir(join(projectRoot, "skills", "core", "skill-authoring-lite"), { recursive: true });
  await mkdir(join(projectRoot, "skills", "local", "duplicate-priority-skill"), { recursive: true });
  await mkdir(join(projectRoot, "skills", "installed", "duplicate-priority-skill"), { recursive: true });
  await mkdir(join(agentDir, "skills", "duplicate-priority-skill"), { recursive: true });
  await mkdir(join(agentDir, "skills", "global-only-skill"), { recursive: true });
  await mkdir(join(projectRoot, "skills", "local", "create-plan"), { recursive: true });
  await mkdir(join(explicitSkills, "external-global-skill"), { recursive: true });

  await writeFile(
    join(projectRoot, "skills", "local", "project-skill", "SKILL.md"),
    [
      "---",
      "name: project-skill",
      "description: Project skill description.",
      "---",
      "",
      "# Project Skill",
    ].join("\n"),
  );
  await writeFile(
    join(projectRoot, "skills", "installed", "installed-skill", "SKILL.md"),
    [
      "---",
      "name: installed-skill",
      "description: Installed skill description.",
      "---",
      "",
      "# Installed Skill",
    ].join("\n"),
  );
  await writeFile(
    join(projectRoot, "skills", "core", "skill-authoring-lite", "SKILL.md"),
    [
      "---",
      "name: skill-authoring-lite",
      "description: Legacy core should lose to system.",
      "---",
      "",
      "# Legacy Core Skill",
    ].join("\n"),
  );
  await writeFile(
    join(projectRoot, "skills", "local", "duplicate-priority-skill", "SKILL.md"),
    [
      "---",
      "name: duplicate-priority-skill",
      "description: Local wins over installed and global.",
      "---",
      "",
      "# Duplicate Local",
    ].join("\n"),
  );
  await writeFile(
    join(projectRoot, "skills", "installed", "duplicate-priority-skill", "SKILL.md"),
    [
      "---",
      "name: duplicate-priority-skill",
      "description: Installed loses to local.",
      "---",
      "",
      "# Duplicate Installed",
    ].join("\n"),
  );
  await writeFile(
    join(agentDir, "skills", "duplicate-priority-skill", "SKILL.md"),
    [
      "---",
      "name: duplicate-priority-skill",
      "description: Global loses to local and installed.",
      "---",
      "",
      "# Duplicate Global",
    ].join("\n"),
  );
  await writeFile(
    join(agentDir, "skills", "global-only-skill", "SKILL.md"),
    [
      "---",
      "name: global-only-skill",
      "description: Global-only skill.",
      "---",
      "",
      "# Global Only Skill",
    ].join("\n"),
  );
  await writeFile(
    join(projectRoot, "skills", "local", "create-plan", "SKILL.md"),
    [
      "---",
      "name: create-plan",
      "description: Local create-plan should lose to system.",
      "---",
      "",
      "# Local Create Plan",
    ].join("\n"),
  );
  await writeFile(
    join(explicitSkills, "external-global-skill", "SKILL.md"),
    [
      "---",
      "name: external-global-skill",
      "description: External skill paths map into global source semantics.",
      "---",
      "",
      "# External Global Skill",
    ].join("\n"),
  );

  const disabledConfig = loadConfig({
    DEVSPACE_ALLOWED_ROOTS: projectRoot,
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_SKILL_PATHS: explicitSkills,
    DEVSPACE_SKILLS: "0",
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  assert.deepEqual(loadWorkspaceSkills(disabledConfig, projectRoot).skills, []);

  const config = loadConfig({
    DEVSPACE_ALLOWED_ROOTS: projectRoot,
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_SKILL_PATHS: explicitSkills,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });
  const loaded = loadWorkspaceSkills(config, projectRoot);

  assert.equal(loaded.skills.some((skill) => skill.name === "project-skill" && skill.source === "local"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "installed-skill" && skill.source === "installed"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "global-only-skill" && skill.source === "global"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "create-plan" && skill.source === "system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "define-goal" && skill.source === "system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "skill-authoring-lite" && skill.source === "system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "external-global-skill" && skill.source === "global"), true);

  const duplicatePrioritySkill = loaded.skills.find((skill) => skill.name === "duplicate-priority-skill");
  assert.ok(duplicatePrioritySkill);
  assert.equal(duplicatePrioritySkill.source, "local");
  assert.match(duplicatePrioritySkill.filePath, /skills\/local\/duplicate-priority-skill\/SKILL\.md$/);

  const legacySystemSkill = loaded.skills.find((skill) => skill.name === "skill-authoring-lite");
  assert.ok(legacySystemSkill);
  assert.doesNotMatch(legacySystemSkill.filePath, /skills\/core\/skill-authoring-lite\/SKILL\.md$/);
  assert.equal(loaded.diagnostics.some((diagnostic) => String(diagnostic.message).includes("skills/core is deprecated")), true);
  assert.equal(loaded.diagnostics.some((diagnostic) => diagnostic.type === "collision"), true);

  const projectSkill = loaded.skills.find((skill) => skill.name === "project-skill");
  assert.ok(projectSkill);
  assert.match(formatPathForPrompt(projectSkill.filePath), /SKILL\.md$/);

  const skillFileRead = resolveSkillReadPath(loaded.skills, new Set(), projectSkill.filePath);
  assert.equal(skillFileRead?.isSkillFile, true);
  assert.equal(skillFileRead?.absolutePath, projectSkill.filePath);

  const resourcePath = join(projectSkill.baseDir, "references.md");
  await writeFile(resourcePath, "reference\n");
  assert.equal(resolveSkillReadPath(loaded.skills, new Set(), resourcePath), undefined);
  assert.equal(
    resolveSkillReadPath(loaded.skills, new Set([projectSkill.baseDir]), resourcePath)?.isSkillFile,
    false,
  );

  const resolvedPlan = await resolveSkillDefinition(loaded.skills, "/plan");
  assert.equal(resolvedPlan.name, "create-plan");
  assert.equal(resolvedPlan.source, "system");
  assert.equal(resolvedPlan.alias, "/plan");
  assert.equal(resolvedPlan.mode, "read_only");
  assert.match(resolvedPlan.instructions, /# Create Plan/);

  const resolvedGoal = await resolveSkillDefinition(loaded.skills, "/goal");
  assert.equal(resolvedGoal.name, "define-goal");
  assert.equal(resolvedGoal.source, "system");
  assert.equal(resolvedGoal.alias, "/goal");
  assert.equal(resolvedGoal.mode, "normal");

  const resolvedExplicit = await resolveSkillDefinition(loaded.skills, "global-only-skill");
  assert.equal(resolvedExplicit.name, "global-only-skill");
  assert.equal(resolvedExplicit.source, "global");
} finally {
  await rm(root, { recursive: true, force: true });
}
