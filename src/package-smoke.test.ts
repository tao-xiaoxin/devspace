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
  "skills/.system/README.md",
  "skills/.system/plan/SKILL.md",
  "skills/.system/plan/references/state.md",
  "skills/.system/goal/SKILL.md",
  "skills/.system/goal/references/metrics.md",
  "skills/.system/workflow/SKILL.md",
  "skills/.system/workflow/references/routing.md",
  "skills/.system/architecture-review/SKILL.md",
  "skills/.system/skill-authoring/SKILL.md",
]) {
  assert.equal(existsSync(resolve(projectRoot, path)), true, `Missing bundled Skill asset: ${path}`);
}

for (const removedPath of [
  "skills/openai",
  "skills/.system/devspace-plan",
  "skills/.system/devspace-goal",
  "skills/.system/devspace-workflow",
  "skills/.system/senior-architect-lite",
  "skills/.system/skill-authoring-lite",
]) {
  assert.equal(existsSync(resolve(projectRoot, removedPath)), false, `Unexpected legacy Skill path: ${removedPath}`);
}
