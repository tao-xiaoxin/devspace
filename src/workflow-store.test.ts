import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SqliteWorkspaceStore, WorkflowRevisionConflictError } from "./workspace-store.js";
import { removeTempDir } from "./test-utils.js";

const root = await mkdtemp(join(tmpdir(), "devspace-workflow-store-test-"));

try {
  const stateDir = join(root, "state");
  const projectRoot = join(root, "project");
  const worktreeRoot = join(root, "project-worktree");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(worktreeRoot, { recursive: true });

  const store = new SqliteWorkspaceStore(stateDir);
  store.createSession({ id: "ws_a", root: projectRoot, mode: "checkout" });
  store.createSession({ id: "ws_b", root: projectRoot, mode: "checkout" });
  store.createSession({ id: "ws_worktree", root: worktreeRoot, mode: "worktree" });

  const projectKey = store.getProjectWorkflowKey("ws_a");
  assert.equal(store.getProjectWorkflowKey("ws_b"), projectKey);
  assert.notEqual(store.getProjectWorkflowKey("ws_worktree"), projectKey);

  const plan = store.savePlan({
    workspaceSessionId: "ws_a",
    expectedRevision: 0,
    title: "Shared workflow state",
    summary: "Persist Plan across sessions.",
    scopeIn: ["workflow store"],
    scopeOut: ["chat transcript storage"],
    validation: ["npm test"],
    risks: ["stale session writes"],
    steps: [
      { step: "Create durable tables", status: "completed" },
      { step: "Expose MCP tools", status: "in_progress" },
    ],
  });
  assert.equal(plan.revision, 1);
  assert.equal(store.getPlan("ws_b")?.title, "Shared workflow state");
  assert.equal(store.getPlan("ws_worktree"), undefined);

  const updatedPlan = store.savePlan({
    workspaceSessionId: "ws_b",
    expectedRevision: 1,
    title: plan.title,
    summary: plan.summary,
    scopeIn: plan.scopeIn,
    scopeOut: plan.scopeOut,
    validation: plan.validation,
    risks: plan.risks,
    steps: [
      { id: plan.steps[0]?.id, step: "Create durable tables", status: "completed" },
      { id: plan.steps[1]?.id, step: "Expose MCP tools", status: "completed" },
    ],
  });
  assert.equal(updatedPlan.revision, 2);
  assert.throws(
    () => store.savePlan({ workspaceSessionId: "ws_a", expectedRevision: 1, title: "Stale plan", steps: [{ step: "No overwrite", status: "pending" }] }),
    (error: unknown) => error instanceof WorkflowRevisionConflictError && error.entity === "plan" && error.currentRevision === 2,
  );

  const goal = store.saveGoal({
    workspaceSessionId: "ws_a",
    objective: "Make workflow state recoverable across sessions",
    scopeIn: ["Plan", "Goal", "mode"],
    scopeOut: ["chat history"],
    successCriteria: ["New sessions read the same Plan and Goal"],
    verification: ["workflow store test"],
    stopConditions: ["database migration fails"],
    currentSummary: "Current: exercise revision conflicts.",
  });
  assert.equal(goal.status, "active");
  assert.equal(store.getGoal("ws_b")?.objective, goal.objective);
  assert.equal("tokenBudget" in goal, false);
  assert.equal("timeUsedSeconds" in goal, false);

  const updatedGoal = store.updateGoal({
    workspaceSessionId: "ws_b",
    expectedRevision: goal.revision,
    currentSummary: "Completed: shared state. Current: validate conflict detection.",
  });
  assert.equal(updatedGoal.revision, 2);
  assert.throws(
    () => store.updateGoal({ workspaceSessionId: "ws_a", expectedRevision: 1, objective: "Stale goal write" }),
    (error: unknown) => error instanceof WorkflowRevisionConflictError && error.entity === "goal" && error.currentRevision === 2,
  );
  const blockedGoal = store.updateGoal({
    workspaceSessionId: "ws_a",
    expectedRevision: updatedGoal.revision,
    status: "blocked",
  });
  assert.equal(blockedGoal.status, "blocked");
  assert.throws(
    () => store.updateGoal({ workspaceSessionId: "ws_b", expectedRevision: blockedGoal.revision, currentSummary: "Should fail" }),
    /Only an active Goal can be updated/,
  );
  const replacementGoal = store.saveGoal({
    workspaceSessionId: "ws_a",
    objective: "Continue after resolving the blocker",
  });
  assert.equal(replacementGoal.status, "active");

  const linkedPlan = store.savePlan({
    workspaceSessionId: "ws_a",
    expectedRevision: updatedPlan.revision,
    goalId: replacementGoal.id,
    title: updatedPlan.title,
    summary: updatedPlan.summary,
    scopeIn: updatedPlan.scopeIn,
    scopeOut: updatedPlan.scopeOut,
    validation: updatedPlan.validation,
    risks: updatedPlan.risks,
    steps: [
      { id: updatedPlan.steps[0]?.id, step: "Create durable tables", status: "completed" },
      { id: updatedPlan.steps[1]?.id, step: "Expose MCP tools", status: "in_progress" },
    ],
  });
  assert.equal(linkedPlan.revision, 3);
  const linkedGoal = store.getGoal("ws_b");
  assert.equal(linkedGoal?.metrics.progress.source, "linked_plan_steps");
  assert.equal(linkedGoal?.metrics.progress.exactFraction, "1/2");
  assert.equal(linkedGoal?.metrics.progress.percentageNumerator, 100);
  assert.equal(linkedGoal?.metrics.progress.percentageDenominator, 2);
  assert.equal(linkedGoal?.metrics.progress.displayPercent, "50.00%");

  const workStart = store.startGoalWork({ workspaceSessionId: "ws_a" });
  assert.equal(workStart.started, true);
  assert.equal(store.startGoalWork({ workspaceSessionId: "ws_b" }).started, false);
  await delay(15);
  const workPause = store.pauseGoalWork({ workspaceSessionId: "ws_b" });
  assert.equal(workPause.paused, true);
  assert.equal(workPause.metrics.workDuration.running, false);
  assert.equal(workPause.metrics.workDuration.totalMilliseconds >= 10, true);
  assert.equal(store.pauseGoalWork({ workspaceSessionId: "ws_a" }).paused, false);

  const tokenUsage = store.recordGoalTokenUsage({
    workspaceSessionId: "ws_a",
    provider: "openai-api",
    providerRequestId: "req_001",
    model: "gpt-test",
    inputTokens: 120,
    outputTokens: 80,
    reasoningTokens: 20,
    totalTokens: 200,
    providerReportedAt: "2026-06-22T00:00:00.000Z",
  });
  assert.equal(tokenUsage.recorded, true);
  assert.deepEqual(tokenUsage.metrics.tokenUsage, {
    inputTokens: 120,
    outputTokens: 80,
    reasoningTokens: 20,
    totalTokens: 200,
    reportCount: 1,
    lastReportedAt: tokenUsage.metrics.tokenUsage.lastReportedAt,
  });
  assert.equal(
    store.recordGoalTokenUsage({
      workspaceSessionId: "ws_b",
      provider: "openai-api",
      providerRequestId: "req_001",
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
    }).recorded,
    false,
  );
  assert.equal(store.getGoal("ws_a")?.metrics.tokenUsage.totalTokens, 200);

  store.setCollaborationMode({ workspaceSessionId: "ws_a", mode: "plan" });
  assert.equal(store.getCollaborationMode("ws_b").mode, "plan");
  const digest = store.getWorkflowDigest("ws_b");
  assert.equal(digest.projectWorkflowKey, projectKey);
  assert.equal(digest.hasActiveGoal, true);
  assert.equal(digest.hasActivePlan, true);
  assert.equal(digest.planRevision, 3);
  assert.deepEqual(digest.steps, { total: 2, completed: 1, inProgress: 1, blocked: 0 });
  assert.equal(Buffer.byteLength(JSON.stringify(digest), "utf8") <= 2 * 1024, true);

  for (let index = 0; index < 120; index++) {
    store.setCollaborationMode({ workspaceSessionId: "ws_a", mode: index % 2 === 0 ? "default" : "plan" });
  }

  const firstPage = store.getWorkflowHistory({ workspaceSessionId: "ws_a", limit: 50 });
  const secondPage = store.getWorkflowHistory({ workspaceSessionId: "ws_a", limit: 50, cursor: firstPage.nextCursor });
  assert.equal(firstPage.events.length, 50);
  assert.equal(secondPage.events.length, 50);
  assert.equal(secondPage.nextCursor, undefined);
  assert.equal(firstPage.events.every((event) => event.summary.length <= 2048), true);

  assert.equal(store.startGoalWork({ workspaceSessionId: "ws_a" }).started, true);
  await delay(5);
  const completedReplacementGoal = store.updateGoal({
    workspaceSessionId: "ws_a",
    expectedRevision: replacementGoal.revision,
    status: "completed",
  });
  assert.equal(completedReplacementGoal.status, "completed");
  assert.equal(completedReplacementGoal.metrics.workDuration.running, false);
  assert.equal(completedReplacementGoal.metrics.workDuration.totalMilliseconds >= workPause.metrics.workDuration.totalMilliseconds, true);

  store.close();
} finally {
  await removeTempDir(root);
}
