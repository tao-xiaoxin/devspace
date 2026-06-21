import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";
import {
  installRootForScope,
  installSkill,
  listInstalledSkills,
  parseGithubTreeUrl,
  removeInstalledSkill,
} from "./skill-manager.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "devspace-skill-manager-test-"));

try {
  const projectRoot = join(root, "project");
  const agentDir = join(root, "agent");
  const localSkill = join(root, "local-installed-skill");
  const remoteRepo = join(root, "remote-skill-repo");
  const conflictingLocal = join(root, "devspace-plan");
  const invalidDirSkill = join(root, "mismatched-dir");
  const symlinkSkill = join(root, "symlink-skill");
  const pluginLikeRoot = join(root, "plugin-like-root");
  const commandsOnlyDir = join(root, "commands-only");

  await mkdir(projectRoot, { recursive: true });
  await mkdir(join(agentDir, "skills"), { recursive: true });
  await mkdir(localSkill, { recursive: true });
  await writeFile(
    join(localSkill, "SKILL.md"),
    [
      "---",
      "name: local-installed-skill",
      "description: Installed from a local path.",
      "---",
      "",
      "# Local Installed Skill",
    ].join("\n"),
  );
  await mkdir(join(localSkill, "references"), { recursive: true });
  await writeFile(join(localSkill, "references", "guide.md"), "hello\n");

  await mkdir(remoteRepo, { recursive: true });
  await mkdir(join(remoteRepo, "skills", ".curated", "remote-installed-skill"), { recursive: true });
  await writeFile(
    join(remoteRepo, "skills", ".curated", "remote-installed-skill", "SKILL.md"),
    [
      "---",
      "name: remote-installed-skill",
      "description: Installed from a git repo.",
      "---",
      "",
      "# Remote Installed Skill",
    ].join("\n"),
  );
  await execFileAsync("git", ["init"], { cwd: remoteRepo });
  await execFileAsync("git", ["config", "user.email", "devspace@example.com"], { cwd: remoteRepo });
  await execFileAsync("git", ["config", "user.name", "DevSpace Test"], { cwd: remoteRepo });
  await execFileAsync("git", ["add", "."], { cwd: remoteRepo });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: remoteRepo });

  await mkdir(conflictingLocal, { recursive: true });
  await writeFile(
    join(conflictingLocal, "SKILL.md"),
    [
      "---",
      "name: devspace-plan",
      "description: Should conflict with system skill.",
      "---",
      "",
      "# Conflicting Local Skill",
    ].join("\n"),
  );

  await mkdir(invalidDirSkill, { recursive: true });
  await writeFile(
    join(invalidDirSkill, "SKILL.md"),
    [
      "---",
      "name: different-name",
      "description: Directory name mismatch.",
      "---",
      "",
      "# Invalid Skill",
    ].join("\n"),
  );

  await mkdir(symlinkSkill, { recursive: true });
  await writeFile(
    join(symlinkSkill, "SKILL.md"),
    [
      "---",
      "name: symlink-skill",
      "description: Should be rejected because of symlink contents.",
      "---",
      "",
      "# Symlink Skill",
    ].join("\n"),
  );
  await symlink(join(root, "project"), join(symlinkSkill, "linked-project"));

  await mkdir(pluginLikeRoot, { recursive: true });
  await writeFile(
    join(pluginLikeRoot, "plugin.json"),
    JSON.stringify({ name: "plugin-like-root" }, null, 2),
  );

  await mkdir(commandsOnlyDir, { recursive: true });
  await writeFile(join(commandsOnlyDir, "README.md"), "# Commands Only\n");

  const config = loadConfig({
    DEVSPACE_ALLOWED_ROOTS: `${projectRoot},${root}`,
    DEVSPACE_AGENT_DIR: agentDir,
    DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
    PORT: "1",
  });

  const installedLocal = await installSkill({
    config,
    workspaceRoot: projectRoot,
    scope: "workspace",
    source: { kind: "local", path: localSkill },
    localPathResolver: (path) => path,
  });
  assert.equal(installedLocal.name, "local-installed-skill");
  assert.equal(installedLocal.scope, "workspace");
  assert.equal(installedLocal.path, join(projectRoot, "skills", "installed", "local-installed-skill"));
  assert.equal(
    await readFile(join(installedLocal.path, "references", "guide.md"), "utf8"),
    "hello\n",
  );

  const listedWorkspace = await listInstalledSkills({
    config,
    workspaceRoot: projectRoot,
    scope: "workspace",
  });
  assert.deepEqual(listedWorkspace.map((skill) => skill.name), ["local-installed-skill"]);

  const installedGlobal = await installSkill({
    config,
    workspaceRoot: projectRoot,
    scope: "global",
    source: {
      kind: "github",
      repo: "example/skills",
      repoUrl: `file://${remoteRepo}`,
      path: "skills/.curated/remote-installed-skill",
      ref: "master",
    },
    runGit: async (args) => {
      await execFileAsync("git", args);
    },
  });
  assert.equal(installedGlobal.scope, "global");
  assert.equal(installedGlobal.name, "remote-installed-skill");
  assert.equal(installedGlobal.path, join(agentDir, "skills", "remote-installed-skill"));

  const listedAll = await listInstalledSkills({
    config,
    workspaceRoot: projectRoot,
    scope: "all",
  });
  assert.deepEqual(
    listedAll.map((skill) => `${skill.scope}:${skill.name}`),
    ["global:remote-installed-skill", "workspace:local-installed-skill"],
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        source: { kind: "local", path: localSkill },
        localPathResolver: (path) => path,
      }),
    /already exists/,
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        source: { kind: "local", path: conflictingLocal },
        localPathResolver: (path) => path,
      }),
    /DevSpace 核心/,
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        source: { kind: "local", path: invalidDirSkill },
        localPathResolver: (path) => path,
      }),
    /directory name must match/,
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        source: { kind: "local", path: symlinkSkill },
        localPathResolver: (path) => path,
      }),
    /symlink/,
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        source: { kind: "local", path: pluginLikeRoot },
        localPathResolver: (path) => path,
      }),
    /missing SKILL\.md/,
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        source: { kind: "local", path: commandsOnlyDir },
        localPathResolver: (path) => path,
      }),
    /missing SKILL\.md/,
  );

  await assert.rejects(
    () =>
      installSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "global",
        source: {
          kind: "github",
          repo: "example/skills",
          repoUrl: `file://${remoteRepo}`,
          path: "../escape",
          ref: "master",
        },
        runGit: async (args) => {
          await execFileAsync("git", args);
        },
      }),
    /Invalid skill path/,
  );

  const removedWorkspace = await removeInstalledSkill({
    config,
    workspaceRoot: projectRoot,
    scope: "workspace",
    name: "local-installed-skill",
  });
  assert.equal(removedWorkspace.name, "local-installed-skill");

  const listedAfterRemove = await listInstalledSkills({
    config,
    workspaceRoot: projectRoot,
    scope: "workspace",
  });
  assert.deepEqual(listedAfterRemove, []);

  await assert.rejects(
    () =>
      removeInstalledSkill({
        config,
        workspaceRoot: projectRoot,
        scope: "workspace",
        name: "missing-skill",
      }),
    /not found/,
  );

  assert.deepEqual(parseGithubTreeUrl("https://github.com/openai/skills/tree/main/skills/.curated/research"), {
    repo: "openai/skills",
    ref: "main",
    path: "skills/.curated/research",
  });

  assert.equal(
    installRootForScope(config, projectRoot, "workspace"),
    join(projectRoot, "skills", "installed"),
  );
  assert.equal(
    installRootForScope(config, projectRoot, "global"),
    join(agentDir, "skills"),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
