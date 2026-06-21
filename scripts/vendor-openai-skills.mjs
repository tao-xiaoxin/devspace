#!/usr/bin/env node
/**
 * Maintainer-only helper for a reviewed local clone of openai/skills.
 * DevSpace never invokes this at runtime.
 *
 * Usage:
 *   node scripts/vendor-openai-skills.mjs --source /path/to/openai-skills --check
 *   node scripts/vendor-openai-skills.mjs --source /path/to/openai-skills --apply
 */

import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = resolve(repositoryRoot, "skills", ".system", "openai");
const expectedRemote = "https://github.com/openai/skills";
const { source, apply } = parseArguments(process.argv.slice(2));

if (!source) {
  fail("Usage: node scripts/vendor-openai-skills.mjs --source /path/to/openai-skills --check|--apply");
}

const sourceRoot = resolve(source);
const sourceSkills = resolve(sourceRoot, "skills");
const sourceStat = await stat(sourceSkills).catch(() => undefined);
if (!sourceStat?.isDirectory()) {
  fail(`Missing upstream skills directory: ${sourceSkills}`);
}

const remote = git(sourceRoot, ["remote", "get-url", "origin"]);
if (!remote || normalizeRemote(remote) !== expectedRemote) {
  fail(`Reviewed source must have origin ${expectedRemote}; got ${remote ?? "<missing>"}.`);
}
const commit = git(sourceRoot, ["rev-parse", "HEAD"]);
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  fail("Could not resolve a full upstream commit SHA.");
}

const fileCount = Number(git(sourceRoot, ["ls-files", "skills"])?.split("\n").filter(Boolean).length ?? 0);
if (!fileCount) fail("No tracked files found below upstream skills/.");

const summary = [
  `Source: ${expectedRemote}`,
  `Commit: ${commit}`,
  `Tracked upstream skill files: ${fileCount}`,
  `Destination: ${resolve(vendorRoot, "skills")}`,
].join("\n");

if (!apply) {
  process.stdout.write(`${summary}\n\nCheck only. Review the upstream diff and licenses, then rerun with --apply.\n`);
  process.exit(0);
}

const stagingRoot = resolve(tmpdir(), `devspace-openai-skills-${process.pid}-${Date.now()}`);
const stagingSkills = resolve(stagingRoot, "skills");
const destinationSkills = resolve(vendorRoot, "skills");
const backupSkills = resolve(vendorRoot, `.skills-backup-${Date.now()}`);

try {
  await mkdir(stagingRoot, { recursive: true });
  await cp(sourceSkills, stagingSkills, { recursive: true, dereference: false, force: true });
  await mkdir(vendorRoot, { recursive: true });

  if (existsSync(destinationSkills)) {
    await rename(destinationSkills, backupSkills);
  }

  try {
    await rename(stagingSkills, destinationSkills);
    await writeFile(resolve(vendorRoot, "UPSTREAM.md"), upstreamManifest(commit), "utf8");
    await rm(backupSkills, { recursive: true, force: true });
  } catch (error) {
    await rm(destinationSkills, { recursive: true, force: true });
    if (existsSync(backupSkills)) await rename(backupSkills, destinationSkills);
    throw error;
  }

  process.stdout.write(`${summary}\n\nVendor copy updated. Review git diff and run npm run typecheck, npm run test, npm run build, and npm pack --dry-run.\n`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}

function parseArguments(argumentsList) {
  let sourcePath;
  let apply = false;
  for (let index = 0; index < argumentsList.length; index++) {
    const value = argumentsList[index];
    if (value === "--source") sourcePath = argumentsList[++index];
    else if (value === "--apply") apply = true;
    else if (value === "--check") apply = false;
    else if (value === "--help" || value === "-h") {
      process.stdout.write("Usage: node scripts/vendor-openai-skills.mjs --source /path/to/openai-skills --check|--apply\n");
      process.exit(0);
    } else fail(`Unknown argument: ${value}`);
  }
  return { source: sourcePath, apply };
}

function git(cwd, argumentsList) {
  try {
    return execFileSync("git", argumentsList, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function normalizeRemote(value) {
  return value
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function upstreamManifest(commit) {
  return [
    `Source repository: ${expectedRemote}.git`,
    `Pinned commit: ${commit}`,
    "Source branch: main",
    `Last synced: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Copied paths:",
    "- skills/.system",
    "- skills/.curated",
    "",
    "Local modifications:",
    "- None. DevSpace-specific behavior belongs in sibling devspace-* Skills.",
    "",
  ].join("\n");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
