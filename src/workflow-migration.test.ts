import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "./db/client.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";
import { removeTempDir } from "./test-utils.js";

const root = await mkdtemp(join(tmpdir(), "devspace-workflow-migration-test-"));

try {
  const stateDir = join(root, "state");
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const sqlite = new Database(databasePath(stateDir));
  sqlite.exec(`
    create table workspace_sessions (
      id text primary key, root text not null, status text not null, mode text not null,
      source_root text, base_ref text, base_sha text, managed text not null,
      created_at text not null, last_used_at text not null
    );
    create table workspace_plans (
      workspace_session_id text primary key, explanation text, steps_json text not null, updated_at text not null
    );
    create table workspace_goals (
      workspace_session_id text primary key, objective text not null, status text not null,
      token_budget text, created_at text not null, updated_at text not null,
      active_seconds text not null, completed_at text, blocked_at text
    );
    create table workspace_modes (
      workspace_session_id text primary key, mode text not null, updated_at text not null
    );
  `);

  const older = "2026-06-20T00:00:00.000Z";
  const newer = "2026-06-21T00:00:00.000Z";
  const insertSession = sqlite.prepare(
    "insert into workspace_sessions values (?, ?, 'active', 'checkout', null, null, null, 'false', ?, ?)",
  );
  insertSession.run("old", projectRoot, older, older);
  insertSession.run("new", projectRoot, newer, newer);
  sqlite.prepare("insert into workspace_plans values (?, ?, ?, ?)").run(
    "old", "Older plan", JSON.stringify([{ step: "Old work", status: "completed" }]), older,
  );
  sqlite.prepare("insert into workspace_plans values (?, ?, ?, ?)").run(
    "new", "Newer plan", JSON.stringify([{ step: "New work", status: "in_progress" }]), newer,
  );
  sqlite.prepare("insert into workspace_goals values (?, ?, ?, null, ?, ?, '0', null, null)").run(
    "old", "Older goal", "completed", older, older,
  );
  sqlite.prepare("insert into workspace_goals values (?, ?, ?, null, ?, ?, '0', null, null)").run(
    "new", "Newer goal", "active", newer, newer,
  );
  sqlite.prepare("insert into workspace_modes values (?, ?, ?)").run("old", "default", older);
  sqlite.prepare("insert into workspace_modes values (?, ?, ?)").run("new", "plan", newer);
  sqlite.close();

  const store = new SqliteWorkspaceStore(stateDir);
  assert.equal(store.getPlan("old")?.summary, "Newer plan");
  assert.equal(store.getGoal("old")?.objective, "Newer goal");
  assert.equal(store.getCollaborationMode("old").mode, "plan");

  const history = store.getWorkflowHistory({ workspaceSessionId: "new", limit: 50 });
  assert.equal(history.events.some((event) => event.eventType === "plan.migrated"), true);
  assert.equal(history.events.some((event) => event.eventType === "plan.archived_migrated"), true);
  assert.equal(history.events.some((event) => event.eventType === "goal.migrated"), true);
  assert.equal(history.events.some((event) => event.eventType === "goal.archived_migrated"), true);
  const eventCount = history.events.length;
  store.close();

  const reopened = new SqliteWorkspaceStore(stateDir);
  assert.equal(reopened.getWorkflowHistory({ workspaceSessionId: "new", limit: 50 }).events.length, eventCount);
  reopened.close();
} finally {
  await removeTempDir(root);
}
