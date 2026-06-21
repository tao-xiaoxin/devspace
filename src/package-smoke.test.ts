import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8")) as {
  files?: unknown;
};

assert.equal(Array.isArray(packageJson.files), true);
assert.equal((packageJson.files as string[]).includes("skills"), true);

for (const path of [
  "skills/.system/devspace-plan/SKILL.md",
  "skills/.system/devspace-plan/references/plan-state.md",
  "skills/.system/devspace-goal/SKILL.md",
  "skills/.system/devspace-goal/references/goal-state.md",
  "skills/.system/devspace-workflow/SKILL.md",
  "skills/.system/devspace-workflow/references/workflow-recovery.md",
  "skills/.system/senior-architect/SKILL.md",
  "skills/.system/skill-authoring/SKILL.md",
]) {
  assert.equal(existsSync(resolve(projectRoot, path)), true, `Missing bundled Skill asset: ${path}`);
}
