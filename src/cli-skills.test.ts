import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "devspace-cli-skills-test-"));

try {
  const help = execFileSync("node", ["--import", "tsx", "src/cli.ts", "help"], {
    cwd: "/Users/thinkook/workspace/open_source/devspace",
    encoding: "utf8",
  });
  assert.match(help, /devspace skills install/);
  assert.match(help, /devspace skills list -g/);
  assert.match(help, /devspace skills remove -g/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
