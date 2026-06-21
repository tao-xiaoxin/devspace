import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";
import {
  loadWorkspaceSkills,
  markSkillActivated,
  resolveSkillDefinition,
  resolveSkillReadPath,
} from "./skills.js";

const root = await mkdtemp(join(tmpdir(), "devspace-skills-test-"));

try {
  const projectRoot = join(root, "project");
  const agentDir = join(root, "agent");
  const explicitSkills = join(root, "explicit-skills");

  await writeSkill(join(projectRoot, "skills", "local", "project-skill"), {
    name: "project-skill",
    description: "Project-local Skill.",
    body: "# Project Skill",
  });
  await writeSkill(join(projectRoot, "skills", "installed", "installed-skill"), {
    name: "installed-skill",
    description: "Installed Skill.",
    body: "# Installed Skill",
  });
  await writeSkill(join(projectRoot, "skills", "core", "duplicate-priority-skill"), {
    name: "duplicate-priority-skill",
    description: "Legacy core loses to local.",
    body: "# Legacy Duplicate",
  });
  await writeSkill(join(projectRoot, "skills", "local", "duplicate-priority-skill"), {
    name: "duplicate-priority-skill",
    description: "Local wins over legacy, installed, and global.",
    body: "# Local Duplicate",
  });
  await writeSkill(join(projectRoot, "skills", "installed", "duplicate-priority-skill"), {
    name: "duplicate-priority-skill",
    description: "Installed loses to local.",
    body: "# Installed Duplicate",
  });
  await writeSkill(join(projectRoot, "skills", "local", "devspace-plan"), {
    name: "devspace-plan",
    description: "Attempted local override that must lose.",
    body: "# Local Plan Override",
  });
  await writeSkill(join(agentDir, "skills", "global-only-skill"), {
    name: "global-only-skill",
    description: "Global Skill.",
    body: "# Global Skill",
  });
  await writeSkill(join(explicitSkills, "external-global-skill"), {
    name: "external-global-skill",
    description: "Explicit global Skill path.",
    body: "# Explicit Global Skill",
  });

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
  assert.equal(loaded.skills.some((skill) => skill.name === "external-global-skill" && skill.source === "global"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "devspace-plan" && skill.source === "devspace_system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "devspace-goal" && skill.source === "devspace_system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "devspace-workflow" && skill.source === "devspace_system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "senior-architect" && skill.source === "devspace_system"), true);
  assert.equal(loaded.skills.some((skill) => skill.name === "skill-authoring" && skill.source === "devspace_system"), true);

  const duplicate = loaded.skills.find((skill) => skill.name === "duplicate-priority-skill");
  assert.ok(duplicate);
  assert.equal(duplicate.source, "local");
  assert.match(duplicate.filePath, /skills\/local\/duplicate-priority-skill\/SKILL\.md$/);
  assert.equal(
    loaded.diagnostics.some((diagnostic) => String(diagnostic.message).includes("skills/core is deprecated")),
    true,
  );

  const plan = loaded.skills.find((skill) => skill.name === "devspace-plan");
  assert.ok(plan);
  assert.equal(plan.source, "devspace_system");
  assert.doesNotMatch(plan.filePath, /skills\/local\/devspace-plan\/SKILL\.md$/);
  assert.match(plan.locator, /^skill:\/\/devspace-system\/devspace-plan\/SKILL\.md$/);

  const resolvedPlan = await resolveSkillDefinition(loaded.skills, "/plan");
  assert.equal(resolvedPlan.name, "devspace-plan");
  assert.equal(resolvedPlan.qualifiedId, "devspace-plan");
  assert.equal(resolvedPlan.source, "devspace_system");
  assert.equal(resolvedPlan.alias, "/plan");
  assert.equal(resolvedPlan.mode, "read_only");
  assert.match(resolvedPlan.instructions, /# DevSpace Plan Workflow/);
  assert.match(resolvedPlan.path, /^skill:\/\//);

  const resolvedGoal = await resolveSkillDefinition(loaded.skills, "/goal");
  assert.equal(resolvedGoal.name, "devspace-goal");
  assert.equal(resolvedGoal.source, "devspace_system");
  assert.equal(resolvedGoal.alias, "/goal");
  assert.equal(resolvedGoal.mode, "normal");
  assert.match(resolvedGoal.instructions, /# DevSpace Goal Workflow/);

  const skillFileRead = resolveSkillReadPath(loaded.skills, new Set(), resolvedPlan.path);
  assert.equal(skillFileRead?.isSkillFile, true);
  assert.equal(skillFileRead?.skill.name, "devspace-plan");

  const resourceLocator = resolvedPlan.path.replace("SKILL.md", "references/plan-state.md");
  assert.equal(resolveSkillReadPath(loaded.skills, new Set(), resourceLocator), undefined);
  const activated = new Set<string>();
  markSkillActivated(activated, resolvedPlan.skill);
  assert.equal(
    resolveSkillReadPath(loaded.skills, activated, resourceLocator)?.isSkillFile,
    false,
  );

  const resolvedExplicit = await resolveSkillDefinition(loaded.skills, "external-global-skill");
  assert.equal(resolvedExplicit.source, "global");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function writeSkill(
  directory: string,
  input: { name: string; description: string; body: string },
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    [
      "---",
      `name: ${input.name}`,
      `description: ${input.description}`,
      "---",
      "",
      input.body,
      "",
    ].join("\n"),
  );
}
