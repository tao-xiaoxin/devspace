import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { openDatabase, type DatabaseHandle } from "./db/client.js";
import {
  workspaceSessions,
  workspaceUserInputs,
  type WorkspaceSessionRow,
  type WorkspaceUserInputRow,
} from "./db/schema.js";
import { parseGoalDefinition } from "./goal-definition.js";

export type WorkspaceMode = "checkout" | "worktree";
export type CollaborationMode = "default" | "plan";
export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type PlanStepStatus = "pending" | "in_progress" | "blocked" | "completed" | "skipped";
export type GoalStatus = "active" | "blocked" | "completed" | "archived";
export type WorkflowEntityType = "plan" | "goal" | "mode";
export type UserInputStatus = "pending" | "completed" | "declined" | "cancelled";
export type UserInputDeliveryMode = "elicitation" | "tool" | "ui";

const MAX_WORKFLOW_TEXT_BYTES = 32 * 1024;
const MAX_SUMMARY_BYTES = 4 * 1024;
const MAX_EVENT_SUMMARY_BYTES = 2 * 1024;
const MAX_WORKFLOW_EVENTS = 100;

export interface WorkspaceSession {
  id: string;
  root: string;
  status: string;
  mode: WorkspaceMode;
  sourceRoot?: string;
  baseRef?: string;
  baseSha?: string;
  managed: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export interface WorkspacePlanStep {
  id?: string;
  step: string;
  status: PlanStepStatus;
  note?: string;
  updatedAt?: string;
}

export interface WorkspacePlan {
  id: string;
  projectWorkflowKey: string;
  goalId?: string;
  title: string;
  summary?: string;
  scopeIn: string[];
  scopeOut: string[];
  validation: string[];
  risks: string[];
  status: PlanStatus;
  revision: number;
  steps: WorkspacePlanStep[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface GoalTokenUsage {
  /** Exact values reported by an upstream provider, never inferred from text length. */
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  reportCount: number;
  lastReportedAt?: string;
}

export interface GoalWorkDuration {
  /** True only while an explicit goal work timer is running on this server. */
  running: boolean;
  startedAt?: string;
  accumulatedMilliseconds: number;
  liveMilliseconds: number;
  totalMilliseconds: number;
  measuredAt: string;
}

export interface GoalProgress {
  /** Progress is exact only when the current Plan is explicitly linked to this Goal. */
  source: "linked_plan_steps" | "unlinked";
  completedSteps: number;
  totalSteps: number;
  /** Exact canonical completion ratio, for example `2/3`. */
  exactFraction?: string;
  /** Exact rational percentage: percentageNumerator / percentageDenominator. */
  percentageNumerator?: number;
  percentageDenominator?: number;
  /** Rounded display only; use the numerator and denominator for machine accuracy. */
  displayPercent?: string;
}

export interface GoalMetrics {
  tokenUsage: GoalTokenUsage;
  workDuration: GoalWorkDuration;
  progress: GoalProgress;
  updatedAt?: string;
}

export interface WorkspaceGoal {
  id: string;
  projectWorkflowKey: string;
  objective: string;
  scopeIn: string[];
  scopeOut: string[];
  successCriteria: string[];
  verification: string[];
  stopConditions: string[];
  currentSummary?: string;
  status: GoalStatus;
  revision: number;
  metrics: GoalMetrics;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface WorkflowDigest {
  projectWorkflowKey: string;
  hasActiveGoal: boolean;
  goalStatus?: GoalStatus;
  goalTitle?: string;
  hasActivePlan: boolean;
  planStatus?: PlanStatus;
  planRevision?: number;
  steps?: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
  };
  lastUpdatedAt?: string;
}

export interface WorkflowEvent {
  id: string;
  projectWorkflowKey: string;
  entityType: WorkflowEntityType;
  entityId: string;
  eventType: string;
  summary: string;
  revision?: number;
  createdAt: string;
}

export interface WorkflowHistoryPage {
  events: WorkflowEvent[];
  nextCursor?: string;
}

export interface WorkspaceQuestionOption {
  label: string;
  description: string;
}

export interface WorkspaceQuestion {
  header: string;
  id: string;
  question: string;
  options: WorkspaceQuestionOption[];
}

export interface WorkspaceUserInputAnswer {
  questionId: string;
  label: string;
}

export interface WorkspaceUserInputResponse {
  answers: WorkspaceUserInputAnswer[];
  summary: string;
  source: UserInputDeliveryMode;
  action: "accept" | "decline" | "cancel";
}

export interface WorkspaceUserInputRecord {
  workspaceSessionId: string;
  questions: WorkspaceQuestion[];
  autoResolutionMs?: number;
  status: UserInputStatus;
  deliveryMode?: UserInputDeliveryMode;
  response?: WorkspaceUserInputResponse;
  createdAt: string;
  updatedAt: string;
  answeredAt?: string;
}

export class WorkflowRevisionConflictError extends Error {
  readonly entity: "plan" | "goal";
  readonly currentRevision: number;

  constructor(entity: "plan" | "goal", currentRevision: number) {
    super(`${entity} revision conflict: current revision is ${currentRevision}. Reload the ${entity} before updating it.`);
    this.name = "WorkflowRevisionConflictError";
    this.entity = entity;
    this.currentRevision = currentRevision;
  }
}

export interface WorkspaceStore {
  createSession(input: {
    id: string;
    root: string;
    mode?: WorkspaceMode;
    sourceRoot?: string;
    baseRef?: string;
    baseSha?: string;
    managed?: boolean;
  }): WorkspaceSession;
  getSession(id: string): WorkspaceSession | undefined;
  touchSession(id: string): void;
  getProjectWorkflowKey(workspaceSessionId: string): string;
  getWorkflowDigest(workspaceSessionId: string): WorkflowDigest;
  getWorkflowHistory(input: {
    workspaceSessionId: string;
    limit?: number;
    cursor?: string;
  }): WorkflowHistoryPage;
  savePlan(input: {
    workspaceSessionId: string;
    expectedRevision: number;
    title?: string;
    summary?: string;
    scopeIn?: string[];
    scopeOut?: string[];
    validation?: string[];
    risks?: string[];
    status?: Exclude<PlanStatus, "archived"> | "archived";
    goalId?: string;
    steps: WorkspacePlanStep[];
  }): WorkspacePlan;
  getPlan(workspaceSessionId: string): WorkspacePlan | undefined;
  saveGoal(input: {
    workspaceSessionId: string;
    objective: string;
    scopeIn?: string[];
    scopeOut?: string[];
    successCriteria?: string[];
    verification?: string[];
    stopConditions?: string[];
    currentSummary?: string;
  }): WorkspaceGoal;
  getGoal(workspaceSessionId: string): WorkspaceGoal | undefined;
  getGoalMetrics(workspaceSessionId: string): GoalMetrics | undefined;
  startGoalWork(input: {
    workspaceSessionId: string;
  }): {
    metrics: GoalMetrics;
    started: boolean;
  };
  pauseGoalWork(input: {
    workspaceSessionId: string;
  }): {
    metrics: GoalMetrics;
    paused: boolean;
  };
  recordGoalTokenUsage(input: {
    workspaceSessionId: string;
    provider: string;
    providerRequestId: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    totalTokens: number;
    providerReportedAt?: string;
  }): {
    metrics: GoalMetrics;
    recorded: boolean;
  };
  updateGoal(input: {
    workspaceSessionId: string;
    expectedRevision: number;
    objective?: string;
    scopeIn?: string[];
    scopeOut?: string[];
    successCriteria?: string[];
    verification?: string[];
    stopConditions?: string[];
    currentSummary?: string;
    status?: GoalStatus;
  }): WorkspaceGoal;
  updateGoalStatus(input: {
    workspaceSessionId: string;
    status: "completed" | "complete" | "blocked" | "archived";
    expectedRevision?: number;
  }): WorkspaceGoal;
  setCollaborationMode(input: {
    workspaceSessionId: string;
    mode: CollaborationMode;
  }): {
    workspaceSessionId: string;
    projectWorkflowKey: string;
    mode: CollaborationMode;
    updatedAt: string;
  };
  getCollaborationMode(workspaceSessionId: string): {
    workspaceSessionId: string;
    projectWorkflowKey: string;
    mode: CollaborationMode;
    updatedAt: string;
  };
  createUserInputRequest(input: {
    workspaceSessionId: string;
    questions: WorkspaceQuestion[];
    autoResolutionMs?: number;
  }): WorkspaceUserInputRecord;
  completeUserInput(input: {
    workspaceSessionId: string;
    answers: WorkspaceUserInputAnswer[];
    summary: string;
    source: UserInputDeliveryMode;
  }): WorkspaceUserInputRecord;
  cancelOrDeclineUserInput(input: {
    workspaceSessionId: string;
    action: "decline" | "cancel";
    source?: UserInputDeliveryMode;
  }): WorkspaceUserInputRecord;
  getPendingUserInput(workspaceSessionId: string): WorkspaceUserInputRecord | undefined;
  getLatestUserInput(workspaceSessionId: string): WorkspaceUserInputRecord | undefined;
  listUserInputHistory(workspaceSessionId: string, limit?: number): WorkspaceUserInputRecord[];
  close?(): void;
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  private readonly database: DatabaseHandle;

  constructor(stateDir: string) {
    this.database = openDatabase(stateDir);
    this.migrate();
  }

  createSession(input: {
    id: string;
    root: string;
    mode?: WorkspaceMode;
    sourceRoot?: string;
    baseRef?: string;
    baseSha?: string;
    managed?: boolean;
  }): WorkspaceSession {
    const now = new Date().toISOString();
    const session: WorkspaceSession = {
      id: input.id,
      root: input.root,
      status: "active",
      mode: input.mode ?? "checkout",
      sourceRoot: input.sourceRoot,
      baseRef: input.baseRef,
      baseSha: input.baseSha,
      managed: input.managed ?? false,
      createdAt: now,
      lastUsedAt: now,
    };

    this.database.db
      .insert(workspaceSessions)
      .values({
        id: session.id,
        root: session.root,
        status: session.status,
        mode: session.mode,
        sourceRoot: session.sourceRoot ?? null,
        baseRef: session.baseRef ?? null,
        baseSha: session.baseSha ?? null,
        managed: String(session.managed),
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      })
      .run();

    this.ensureProjectWorkflow(session.root, session.mode);
    return session;
  }

  getSession(id: string): WorkspaceSession | undefined {
    const row = this.database.db
      .select()
      .from(workspaceSessions)
      .where(eq(workspaceSessions.id, id))
      .get();

    return row ? rowToWorkspaceSession(row) : undefined;
  }

  touchSession(id: string): void {
    this.database.db
      .update(workspaceSessions)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(workspaceSessions.id, id))
      .run();
  }

  getProjectWorkflowKey(workspaceSessionId: string): string {
    return this.workflowForSession(workspaceSessionId).key;
  }

  getWorkflowDigest(workspaceSessionId: string): WorkflowDigest {
    const workflow = this.workflowForSession(workspaceSessionId);
    const plan = this.getPlan(workspaceSessionId);
    const goal = this.getGoal(workspaceSessionId);
    const updatedAt = [plan?.updatedAt, goal?.updatedAt, goal?.metrics.updatedAt]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return {
      projectWorkflowKey: workflow.key,
      hasActiveGoal: goal?.status === "active",
      goalStatus: goal?.status,
      goalTitle: goal ? truncateText(goal.objective, 160) : undefined,
      hasActivePlan: Boolean(plan && (plan.status === "draft" || plan.status === "active")),
      planStatus: plan?.status,
      planRevision: plan?.revision,
      steps: plan
        ? {
            total: plan.steps.length,
            completed: plan.steps.filter((step) => step.status === "completed").length,
            inProgress: plan.steps.filter((step) => step.status === "in_progress").length,
            blocked: plan.steps.filter((step) => step.status === "blocked").length,
          }
        : undefined,
      lastUpdatedAt: updatedAt,
    };
  }

  getWorkflowHistory(input: {
    workspaceSessionId: string;
    limit?: number;
    cursor?: string;
  }): WorkflowHistoryPage {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
    const cursor = decodeHistoryCursor(input.cursor);
    const rows = cursor
      ? this.database.sqlite
          .prepare(
            `select id, project_workflow_key, entity_type, entity_id, event_type, summary, revision, created_at
             from workflow_events
             where project_workflow_key = ?
               and (created_at < ? or (created_at = ? and id < ?))
             order by created_at desc, id desc
             limit ?`,
          )
          .all(workflow.key, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : this.database.sqlite
          .prepare(
            `select id, project_workflow_key, entity_type, entity_id, event_type, summary, revision, created_at
             from workflow_events
             where project_workflow_key = ?
             order by created_at desc, id desc
             limit ?`,
          )
          .all(workflow.key, limit + 1);

    const pageRows = (rows as WorkflowEventRow[]).slice(0, limit);
    const events = pageRows.map(rowToWorkflowEvent);
    const lastReturned = pageRows.at(-1);
    const hasMore = (rows as WorkflowEventRow[]).length > pageRows.length;

    return {
      events,
      nextCursor: hasMore && lastReturned
        ? encodeHistoryCursor({ createdAt: lastReturned.created_at, id: lastReturned.id })
        : undefined,
    };
  }

  savePlan(input: {
    workspaceSessionId: string;
    expectedRevision: number;
    title?: string;
    summary?: string;
    scopeIn?: string[];
    scopeOut?: string[];
    validation?: string[];
    risks?: string[];
    status?: PlanStatus;
    goalId?: string;
    steps: WorkspacePlanStep[];
  }): WorkspacePlan {
    validatePlanSteps(input.steps);
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const existing = this.getPlan(input.workspaceSessionId);
    const now = new Date().toISOString();

    if (!existing && input.expectedRevision !== 0) {
      throw new WorkflowRevisionConflictError("plan", 0);
    }
    if (existing && input.expectedRevision !== existing.revision) {
      throw new WorkflowRevisionConflictError("plan", existing.revision);
    }

    return this.database.sqlite.transaction(() => {
      const isCreate = !existing;
      const status = input.status ?? existing?.status ?? "active";
      const plan: WorkspacePlan = {
        id: existing?.id ?? randomUUID(),
        projectWorkflowKey: workflow.key,
        goalId: input.goalId ?? existing?.goalId,
        title: normalizeRequiredText(input.title ?? existing?.title ?? "Project plan", "Plan title"),
        summary: normalizeOptionalText(input.summary ?? existing?.summary, MAX_WORKFLOW_TEXT_BYTES),
        scopeIn: normalizeStringList(input.scopeIn ?? existing?.scopeIn ?? []),
        scopeOut: normalizeStringList(input.scopeOut ?? existing?.scopeOut ?? []),
        validation: normalizeStringList(input.validation ?? existing?.validation ?? []),
        risks: normalizeStringList(input.risks ?? existing?.risks ?? []),
        status,
        revision: (existing?.revision ?? 0) + 1,
        steps: normalizePlanSteps(input.steps, now),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        archivedAt: status === "archived" ? now : undefined,
      };

      if (isCreate) {
        const inserted = this.database.sqlite
          .prepare(
            `insert into workflow_plans (
              id, project_workflow_key, goal_id, title, summary,
              scope_in_json, scope_out_json, validation_json, risks_json,
              status, revision, is_current, created_at, updated_at, archived_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict do nothing`,
          )
          .run(
            plan.id,
            plan.projectWorkflowKey,
            plan.goalId ?? null,
            plan.title,
            plan.summary ?? null,
            JSON.stringify(plan.scopeIn),
            JSON.stringify(plan.scopeOut),
            JSON.stringify(plan.validation),
            JSON.stringify(plan.risks),
            plan.status,
            plan.revision,
            plan.status === "archived" ? 0 : 1,
            plan.createdAt,
            plan.updatedAt,
            plan.archivedAt ?? null,
          );
        if (inserted.changes !== 1) {
          throw new WorkflowRevisionConflictError("plan", this.currentPlanRevision(workflow.key));
        }
      } else {
        const updated = this.database.sqlite
          .prepare(
            `update workflow_plans
             set goal_id = ?, title = ?, summary = ?, scope_in_json = ?, scope_out_json = ?,
                 validation_json = ?, risks_json = ?, status = ?, revision = ?,
                 is_current = ?, updated_at = ?, archived_at = ?
             where id = ? and revision = ? and is_current = 1`,
          )
          .run(
            plan.goalId ?? null,
            plan.title,
            plan.summary ?? null,
            JSON.stringify(plan.scopeIn),
            JSON.stringify(plan.scopeOut),
            JSON.stringify(plan.validation),
            JSON.stringify(plan.risks),
            plan.status,
            plan.revision,
            plan.status === "archived" ? 0 : 1,
            plan.updatedAt,
            plan.archivedAt ?? null,
            plan.id,
            input.expectedRevision,
          );
        if (updated.changes !== 1) {
          throw new WorkflowRevisionConflictError("plan", this.currentPlanRevision(workflow.key));
        }
        this.database.sqlite.prepare("delete from workflow_plan_steps where plan_id = ?").run(plan.id);
      }

      this.insertPlanSteps(plan);
      this.recordWorkflowEvent({
        projectWorkflowKey: workflow.key,
        entityType: "plan",
        entityId: plan.id,
        eventType: isCreate ? "plan.created" : plan.status === "archived" ? "plan.archived" : "plan.updated",
        summary: truncateText(`${isCreate ? "Created" : "Updated"} plan: ${plan.title}`, MAX_EVENT_SUMMARY_BYTES),
        revision: plan.revision,
        createdAt: now,
      });
      return plan;
    })();
  }

  getPlan(workspaceSessionId: string): WorkspacePlan | undefined {
    const workflow = this.workflowForSession(workspaceSessionId);
    return this.getCurrentPlanForWorkflow(workflow.key);
  }

  saveGoal(input: {
    workspaceSessionId: string;
    objective: string;
    scopeIn?: string[];
    scopeOut?: string[];
    successCriteria?: string[];
    verification?: string[];
    stopConditions?: string[];
    currentSummary?: string;
  }): WorkspaceGoal {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const now = new Date().toISOString();
    const goal: WorkspaceGoal = {
      id: randomUUID(),
      projectWorkflowKey: workflow.key,
      objective: normalizeRequiredText(input.objective, "Goal objective"),
      scopeIn: normalizeStringList(input.scopeIn ?? []),
      scopeOut: normalizeStringList(input.scopeOut ?? []),
      successCriteria: normalizeStringList(input.successCriteria ?? []),
      verification: normalizeStringList(input.verification ?? []),
      stopConditions: normalizeStringList(input.stopConditions ?? []),
      currentSummary: normalizeOptionalText(input.currentSummary, MAX_SUMMARY_BYTES),
      status: "active",
      revision: 1,
      metrics: emptyGoalMetrics(now),
      createdAt: now,
      updatedAt: now,
    };

    return this.database.sqlite.transaction(() => {
      const current = this.database.sqlite
        .prepare("select id, status from workflow_goals where project_workflow_key = ? and is_current = 1 limit 1")
        .get(workflow.key) as { id: string; status: string } | undefined;
      if (current?.status === "active") {
        throw new Error("An active goal already exists for this project workflow.");
      }
      if (current) {
        this.database.sqlite
          .prepare("update workflow_goals set is_current = 0 where id = ? and is_current = 1")
          .run(current.id);
      }

      this.database.sqlite
        .prepare(
          `insert into workflow_goals (
            id, project_workflow_key, objective, scope_in_json, scope_out_json,
            success_criteria_json, verification_json, stop_conditions_json, current_summary,
            status, revision, is_current, created_at, updated_at, archived_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, null)`,
        )
        .run(
          goal.id,
          goal.projectWorkflowKey,
          goal.objective,
          JSON.stringify(goal.scopeIn),
          JSON.stringify(goal.scopeOut),
          JSON.stringify(goal.successCriteria),
          JSON.stringify(goal.verification),
          JSON.stringify(goal.stopConditions),
          goal.currentSummary ?? null,
          goal.status,
          goal.revision,
          goal.createdAt,
          goal.updatedAt,
        );
      this.ensureGoalMetricsRecord(goal.id, now);

      this.recordWorkflowEvent({
        projectWorkflowKey: workflow.key,
        entityType: "goal",
        entityId: goal.id,
        eventType: "goal.created",
        summary: truncateText(`Created goal: ${goal.objective}`, MAX_EVENT_SUMMARY_BYTES),
        revision: goal.revision,
        createdAt: now,
      });
      return this.hydrateGoalMetrics(goal, workflow.key, now);
    })();
  }

  getGoal(workspaceSessionId: string): WorkspaceGoal | undefined {
    const workflow = this.workflowForSession(workspaceSessionId);
    const row = this.database.sqlite
      .prepare(
        `select id, project_workflow_key, objective, scope_in_json, scope_out_json,
                success_criteria_json, verification_json, stop_conditions_json, current_summary,
                status, revision, created_at, updated_at, archived_at
         from workflow_goals
         where project_workflow_key = ? and is_current = 1
         order by updated_at desc, id desc
         limit 1`,
      )
      .get(workflow.key) as WorkflowGoalRow | undefined;

    return row ? this.hydrateGoalMetrics(rowToWorkspaceGoal(row), workflow.key) : undefined;
  }

  getGoalMetrics(workspaceSessionId: string): GoalMetrics | undefined {
    return this.getGoal(workspaceSessionId)?.metrics;
  }

  startGoalWork(input: { workspaceSessionId: string }): {
    metrics: GoalMetrics;
    started: boolean;
  } {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const goal = this.getGoal(input.workspaceSessionId);
    if (!goal) throw new Error("No current Goal exists for this project workflow.");
    if (goal.status !== "active") throw new Error("Only an active Goal can start work tracking.");
    const now = new Date().toISOString();

    return this.database.sqlite.transaction(() => {
      this.ensureGoalMetricsRecord(goal.id, now);
      const started = this.database.sqlite
        .prepare(
          `update workflow_goal_metrics
           set active_work_started_at = ?, updated_at = ?
           where goal_id = ? and active_work_started_at is null`,
        )
        .run(now, now, goal.id).changes === 1;
      if (started) {
        this.recordWorkflowEvent({
          projectWorkflowKey: workflow.key,
          entityType: "goal",
          entityId: goal.id,
          eventType: "goal.work_started",
          summary: "Started exact goal work timer.",
          revision: goal.revision,
          createdAt: now,
        });
      }
      return {
        metrics: this.hydrateGoalMetrics(goal, workflow.key, now).metrics,
        started,
      };
    })();
  }

  pauseGoalWork(input: { workspaceSessionId: string }): {
    metrics: GoalMetrics;
    paused: boolean;
  } {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const goal = this.getGoal(input.workspaceSessionId);
    if (!goal) throw new Error("No current Goal exists for this project workflow.");
    const now = new Date().toISOString();

    return this.database.sqlite.transaction(() => {
      const paused = this.pauseGoalWorkForGoal(goal.id, now);
      if (paused) {
        this.recordWorkflowEvent({
          projectWorkflowKey: workflow.key,
          entityType: "goal",
          entityId: goal.id,
          eventType: "goal.work_paused",
          summary: "Paused exact goal work timer.",
          revision: goal.revision,
          createdAt: now,
        });
      }
      return {
        metrics: this.hydrateGoalMetrics(goal, workflow.key, now).metrics,
        paused,
      };
    })();
  }

  recordGoalTokenUsage(input: {
    workspaceSessionId: string;
    provider: string;
    providerRequestId: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    totalTokens: number;
    providerReportedAt?: string;
  }): {
    metrics: GoalMetrics;
    recorded: boolean;
  } {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const goal = this.getGoal(input.workspaceSessionId);
    if (!goal) throw new Error("No current Goal exists for this project workflow.");
    validateTokenUsage(input);
    const now = new Date().toISOString();

    return this.database.sqlite.transaction(() => {
      this.ensureGoalMetricsRecord(goal.id, now);
      const result = this.database.sqlite
        .prepare(
          `insert into workflow_goal_token_usage (
            id, goal_id, provider, provider_request_id, model,
            input_tokens, output_tokens, reasoning_tokens, total_tokens,
            provider_reported_at, recorded_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(goal_id, provider, provider_request_id) do nothing`,
        )
        .run(
          randomUUID(),
          goal.id,
          normalizeRequiredText(input.provider, "Token usage provider"),
          normalizeRequiredText(input.providerRequestId, "Provider request ID"),
          normalizeOptionalText(input.model, 512) ?? null,
          input.inputTokens,
          input.outputTokens,
          input.reasoningTokens ?? 0,
          input.totalTokens,
          input.providerReportedAt ?? null,
          now,
        );
      const recorded = result.changes === 1;
      if (recorded) {
        this.database.sqlite
          .prepare("update workflow_goal_metrics set updated_at = ? where goal_id = ?")
          .run(now, goal.id);
        this.recordWorkflowEvent({
          projectWorkflowKey: workflow.key,
          entityType: "goal",
          entityId: goal.id,
          eventType: "goal.token_usage_recorded",
          summary: `Recorded provider-reported token usage from ${input.provider}.`,
          revision: goal.revision,
          createdAt: now,
        });
      }
      return {
        metrics: this.hydrateGoalMetrics(goal, workflow.key, now).metrics,
        recorded,
      };
    })();
  }

  updateGoal(input: {
    workspaceSessionId: string;
    expectedRevision: number;
    objective?: string;
    scopeIn?: string[];
    scopeOut?: string[];
    successCriteria?: string[];
    verification?: string[];
    stopConditions?: string[];
    currentSummary?: string;
    status?: GoalStatus;
  }): WorkspaceGoal {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const existing = this.getGoal(input.workspaceSessionId);
    if (!existing) {
      throw new Error("No current goal exists for this project workflow.");
    }
    if (existing.status !== "active") {
      throw new Error("Only an active Goal can be updated. Create a new Goal after completing, blocking, or archiving the previous Goal.");
    }
    if (input.expectedRevision !== existing.revision) {
      throw new WorkflowRevisionConflictError("goal", existing.revision);
    }

    const now = new Date().toISOString();
    const status = input.status ?? existing.status;
    const goal: WorkspaceGoal = {
      ...existing,
      objective: input.objective === undefined ? existing.objective : normalizeRequiredText(input.objective, "Goal objective"),
      scopeIn: input.scopeIn === undefined ? existing.scopeIn : normalizeStringList(input.scopeIn),
      scopeOut: input.scopeOut === undefined ? existing.scopeOut : normalizeStringList(input.scopeOut),
      successCriteria: input.successCriteria === undefined
        ? existing.successCriteria
        : normalizeStringList(input.successCriteria),
      verification: input.verification === undefined ? existing.verification : normalizeStringList(input.verification),
      stopConditions: input.stopConditions === undefined
        ? existing.stopConditions
        : normalizeStringList(input.stopConditions),
      currentSummary: input.currentSummary === undefined
        ? existing.currentSummary
        : normalizeOptionalText(input.currentSummary, MAX_SUMMARY_BYTES),
      status,
      revision: existing.revision + 1,
      updatedAt: now,
      archivedAt: status === "archived" ? now : undefined,
    };

    return this.database.sqlite.transaction(() => {
      const updated = this.database.sqlite
        .prepare(
          `update workflow_goals
           set objective = ?, scope_in_json = ?, scope_out_json = ?, success_criteria_json = ?,
               verification_json = ?, stop_conditions_json = ?, current_summary = ?, status = ?,
               revision = ?, is_current = ?, updated_at = ?, archived_at = ?
           where id = ? and revision = ? and is_current = 1 and status = 'active'`,
        )
        .run(
          goal.objective,
          JSON.stringify(goal.scopeIn),
          JSON.stringify(goal.scopeOut),
          JSON.stringify(goal.successCriteria),
          JSON.stringify(goal.verification),
          JSON.stringify(goal.stopConditions),
          goal.currentSummary ?? null,
          goal.status,
          goal.revision,
          goal.status === "archived" ? 0 : 1,
          goal.updatedAt,
          goal.archivedAt ?? null,
          goal.id,
          input.expectedRevision,
        );
      if (updated.changes !== 1) {
        throw new WorkflowRevisionConflictError("goal", this.currentGoalRevision(workflow.key));
      }
      if (goal.status !== "active") {
        this.pauseGoalWorkForGoal(goal.id, now);
      }

      const eventType = goal.status === "archived"
        ? "goal.archived"
        : goal.status === "completed"
          ? "goal.completed"
          : goal.status === "blocked"
            ? "goal.blocked"
            : "goal.updated";
      this.recordWorkflowEvent({
        projectWorkflowKey: workflow.key,
        entityType: "goal",
        entityId: goal.id,
        eventType,
        summary: truncateText(`Updated goal: ${goal.objective}`, MAX_EVENT_SUMMARY_BYTES),
        revision: goal.revision,
        createdAt: now,
      });
      return this.hydrateGoalMetrics(goal, workflow.key, now);
    })();
  }

  updateGoalStatus(input: {
    workspaceSessionId: string;
    status: "completed" | "complete" | "blocked" | "archived";
    expectedRevision?: number;
  }): WorkspaceGoal {
    const existing = this.getGoal(input.workspaceSessionId);
    if (!existing) {
      throw new Error("No current goal exists for this project workflow.");
    }
    return this.updateGoal({
      workspaceSessionId: input.workspaceSessionId,
      expectedRevision: input.expectedRevision ?? existing.revision,
      status: input.status === "complete" ? "completed" : input.status,
    });
  }

  setCollaborationMode(input: {
    workspaceSessionId: string;
    mode: CollaborationMode;
  }): {
    workspaceSessionId: string;
    projectWorkflowKey: string;
    mode: CollaborationMode;
    updatedAt: string;
  } {
    const workflow = this.workflowForSession(input.workspaceSessionId);
    const updatedAt = new Date().toISOString();

    this.database.sqlite
      .prepare(
        `insert into workflow_modes (project_workflow_key, mode, updated_at)
         values (?, ?, ?)
         on conflict(project_workflow_key) do update set mode = excluded.mode, updated_at = excluded.updated_at`,
      )
      .run(workflow.key, input.mode, updatedAt);

    this.recordWorkflowEvent({
      projectWorkflowKey: workflow.key,
      entityType: "mode",
      entityId: workflow.key,
      eventType: "mode.changed",
      summary: `Collaboration mode changed to ${input.mode}.`,
      createdAt: updatedAt,
    });

    return {
      workspaceSessionId: input.workspaceSessionId,
      projectWorkflowKey: workflow.key,
      mode: input.mode,
      updatedAt,
    };
  }

  getCollaborationMode(workspaceSessionId: string): {
    workspaceSessionId: string;
    projectWorkflowKey: string;
    mode: CollaborationMode;
    updatedAt: string;
  } {
    const workflow = this.workflowForSession(workspaceSessionId);
    const row = this.database.sqlite
      .prepare("select mode, updated_at from workflow_modes where project_workflow_key = ?")
      .get(workflow.key) as { mode: string; updated_at: string } | undefined;

    return {
      workspaceSessionId,
      projectWorkflowKey: workflow.key,
      mode: row?.mode === "plan" ? "plan" : "default",
      updatedAt: row?.updated_at ?? "",
    };
  }

  createUserInputRequest(input: {
    workspaceSessionId: string;
    questions: WorkspaceQuestion[];
    autoResolutionMs?: number;
  }): WorkspaceUserInputRecord {
    const existing = this.getPendingUserInput(input.workspaceSessionId);
    if (existing) {
      throw new Error("A pending user-input request already exists for this workspace.");
    }

    const now = new Date().toISOString();
    const record: WorkspaceUserInputRecord = {
      workspaceSessionId: input.workspaceSessionId,
      questions: input.questions,
      autoResolutionMs: input.autoResolutionMs,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    return this.persistUserInputRecord(record);
  }

  completeUserInput(input: {
    workspaceSessionId: string;
    answers: WorkspaceUserInputAnswer[];
    summary: string;
    source: UserInputDeliveryMode;
  }): WorkspaceUserInputRecord {
    const existing = this.getPendingUserInput(input.workspaceSessionId);
    if (!existing) {
      throw new Error("No pending user-input request exists for this workspace.");
    }

    const now = new Date().toISOString();
    return this.persistUserInputRecord({
      ...existing,
      status: "completed",
      deliveryMode: input.source,
      response: {
        answers: input.answers,
        summary: input.summary,
        source: input.source,
        action: "accept",
      },
      updatedAt: now,
      answeredAt: now,
    });
  }

  cancelOrDeclineUserInput(input: {
    workspaceSessionId: string;
    action: "decline" | "cancel";
    source?: UserInputDeliveryMode;
  }): WorkspaceUserInputRecord {
    const existing = this.getPendingUserInput(input.workspaceSessionId);
    if (!existing) {
      throw new Error("No pending user-input request exists for this workspace.");
    }

    const now = new Date().toISOString();
    const status: UserInputStatus = input.action === "decline" ? "declined" : "cancelled";

    return this.persistUserInputRecord({
      ...existing,
      status,
      deliveryMode: input.source,
      response: {
        answers: [],
        summary: input.action === "decline" ? "User declined to answer." : "User cancelled the request.",
        source: input.source ?? "elicitation",
        action: input.action,
      },
      updatedAt: now,
      answeredAt: now,
    });
  }

  getPendingUserInput(workspaceSessionId: string): WorkspaceUserInputRecord | undefined {
    const record = this.getLatestUserInput(workspaceSessionId);
    return record?.status === "pending" ? record : undefined;
  }

  getLatestUserInput(workspaceSessionId: string): WorkspaceUserInputRecord | undefined {
    const row = this.database.db
      .select()
      .from(workspaceUserInputs)
      .where(eq(workspaceUserInputs.workspaceSessionId, workspaceSessionId))
      .get();

    return row ? rowToWorkspaceUserInput(row) : undefined;
  }

  listUserInputHistory(workspaceSessionId: string, limit = 5): WorkspaceUserInputRecord[] {
    const record = this.getLatestUserInput(workspaceSessionId);
    if (!record) return [];
    return [record].slice(0, Math.max(1, limit));
  }

  close(): void {
    this.database.close();
  }
  private currentPlanRevision(projectWorkflowKey: string): number {
    const row = this.database.sqlite
      .prepare("select revision from workflow_plans where project_workflow_key = ? and is_current = 1 limit 1")
      .get(projectWorkflowKey) as { revision: number } | undefined;
    return row?.revision ?? 0;
  }

  private currentGoalRevision(projectWorkflowKey: string): number {
    const row = this.database.sqlite
      .prepare("select revision from workflow_goals where project_workflow_key = ? and is_current = 1 limit 1")
      .get(projectWorkflowKey) as { revision: number } | undefined;
    return row?.revision ?? 0;
  }

  private workflowForSession(workspaceSessionId: string): { key: string; canonicalRoot: string; mode: WorkspaceMode } {
    const session = this.getSession(workspaceSessionId);
    if (!session) {
      throw new Error(`Unknown workspace session: ${workspaceSessionId}`);
    }
    return this.ensureProjectWorkflow(session.root, session.mode);
  }

  private ensureProjectWorkflow(root: string, mode: WorkspaceMode): {
    key: string;
    canonicalRoot: string;
    mode: WorkspaceMode;
  } {
    const canonicalRoot = canonicalizeRoot(root);
    const key = projectWorkflowKeyForRoot(canonicalRoot);
    const now = new Date().toISOString();
    const existing = this.database.sqlite
      .prepare("select project_workflow_key from project_workflows where project_workflow_key = ?")
      .get(key);

    if (existing) {
      this.database.sqlite
        .prepare("update project_workflows set workspace_kind = ?, updated_at = ? where project_workflow_key = ?")
        .run(mode, now, key);
      return { key, canonicalRoot, mode };
    }

    const git = readGitIdentity(canonicalRoot);
    this.database.sqlite
      .prepare(
        `insert into project_workflows (
          project_workflow_key, canonical_root, workspace_kind, git_common_dir, git_remote_origin, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(key, canonicalRoot, mode, git.commonDir ?? null, git.remoteOrigin ?? null, now, now);

    return { key, canonicalRoot, mode };
  }

  private getCurrentPlanForWorkflow(projectWorkflowKey: string): WorkspacePlan | undefined {
    const row = this.database.sqlite
      .prepare(
        `select id, project_workflow_key, goal_id, title, summary,
                scope_in_json, scope_out_json, validation_json, risks_json,
                status, revision, created_at, updated_at, archived_at
         from workflow_plans
         where project_workflow_key = ? and is_current = 1
         order by updated_at desc, id desc
         limit 1`,
      )
      .get(projectWorkflowKey) as WorkflowPlanRow | undefined;
    return row ? this.rowToWorkspacePlan(row) : undefined;
  }

  private ensureGoalMetricsRecord(goalId: string, now: string): void {
    this.database.sqlite
      .prepare(
        `insert into workflow_goal_metrics (
          goal_id, active_work_started_at, accumulated_work_ms, updated_at
        ) values (?, null, 0, ?)
        on conflict(goal_id) do nothing`,
      )
      .run(goalId, now);
  }

  private pauseGoalWorkForGoal(goalId: string, now: string): boolean {
    const row = this.database.sqlite
      .prepare(
        `select active_work_started_at, accumulated_work_ms
         from workflow_goal_metrics where goal_id = ?`,
      )
      .get(goalId) as GoalMetricsRow | undefined;
    if (!row?.active_work_started_at) return false;

    const elapsed = elapsedMilliseconds(row.active_work_started_at, now);
    const result = this.database.sqlite
      .prepare(
        `update workflow_goal_metrics
         set active_work_started_at = null, accumulated_work_ms = ?, updated_at = ?
         where goal_id = ? and active_work_started_at = ?`,
      )
      .run(Number(row.accumulated_work_ms) + elapsed, now, goalId, row.active_work_started_at);
    return result.changes === 1;
  }

  private hydrateGoalMetrics(
    goal: WorkspaceGoal,
    projectWorkflowKey: string,
    measuredAt = new Date().toISOString(),
  ): WorkspaceGoal {
    const row = this.database.sqlite
      .prepare(
        `select active_work_started_at, accumulated_work_ms, updated_at
         from workflow_goal_metrics where goal_id = ?`,
      )
      .get(goal.id) as GoalMetricsRow | undefined;
    const usage = this.database.sqlite
      .prepare(
        `select
           coalesce(sum(input_tokens), 0) as input_tokens,
           coalesce(sum(output_tokens), 0) as output_tokens,
           coalesce(sum(reasoning_tokens), 0) as reasoning_tokens,
           coalesce(sum(total_tokens), 0) as total_tokens,
           count(*) as report_count,
           max(recorded_at) as last_reported_at
         from workflow_goal_token_usage where goal_id = ?`,
      )
      .get(goal.id) as GoalTokenUsageRow;
    const accumulatedMilliseconds = Number(row?.accumulated_work_ms ?? 0);
    const liveMilliseconds = row?.active_work_started_at
      ? elapsedMilliseconds(row.active_work_started_at, measuredAt)
      : 0;
    const linkedPlan = this.getCurrentPlanForWorkflow(projectWorkflowKey);
    const progress = linkedPlan?.goalId === goal.id
      ? goalProgressFromPlan(linkedPlan)
      : unlinkedGoalProgress();

    return {
      ...goal,
      metrics: {
        tokenUsage: {
          inputTokens: Number(usage.input_tokens ?? 0),
          outputTokens: Number(usage.output_tokens ?? 0),
          reasoningTokens: Number(usage.reasoning_tokens ?? 0),
          totalTokens: Number(usage.total_tokens ?? 0),
          reportCount: Number(usage.report_count ?? 0),
          lastReportedAt: usage.last_reported_at ?? undefined,
        },
        workDuration: {
          running: Boolean(row?.active_work_started_at),
          startedAt: row?.active_work_started_at ?? undefined,
          accumulatedMilliseconds,
          liveMilliseconds,
          totalMilliseconds: accumulatedMilliseconds + liveMilliseconds,
          measuredAt,
        },
        progress,
        updatedAt: maxIsoTimestamp(row?.updated_at, usage.last_reported_at),
      },
    };
  }

  private insertPlanSteps(plan: WorkspacePlan): void {
    const statement = this.database.sqlite.prepare(
      `insert into workflow_plan_steps (id, plan_id, position, content, status, note, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [position, step] of plan.steps.entries()) {
      statement.run(
        step.id ?? randomUUID(),
        plan.id,
        position,
        step.step,
        step.status,
        step.note ?? null,
        step.updatedAt ?? plan.updatedAt,
      );
    }
  }

  private rowToWorkspacePlan(row: WorkflowPlanRow): WorkspacePlan {
    const stepRows = this.database.sqlite
      .prepare(
        `select id, position, content, status, note, updated_at
         from workflow_plan_steps where plan_id = ? order by position asc`,
      )
      .all(row.id) as WorkflowPlanStepRow[];

    return {
      id: row.id,
      projectWorkflowKey: row.project_workflow_key,
      goalId: row.goal_id ?? undefined,
      title: row.title,
      summary: row.summary ?? undefined,
      scopeIn: parseStringList(row.scope_in_json),
      scopeOut: parseStringList(row.scope_out_json),
      validation: parseStringList(row.validation_json),
      risks: parseStringList(row.risks_json),
      status: normalizePlanStatus(row.status),
      revision: Number(row.revision),
      steps: stepRows.map((step) => ({
        id: step.id,
        step: step.content,
        status: normalizePlanStepStatus(step.status),
        note: step.note ?? undefined,
        updatedAt: step.updated_at,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at ?? undefined,
    };
  }

  private recordWorkflowEvent(input: Omit<WorkflowEvent, "id">): void {
    this.database.sqlite
      .prepare(
        `insert into workflow_events (
          id, project_workflow_key, entity_type, entity_id, event_type, summary, revision, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.projectWorkflowKey,
        input.entityType,
        input.entityId,
        input.eventType,
        truncateText(input.summary, MAX_EVENT_SUMMARY_BYTES),
        input.revision ?? null,
        input.createdAt,
      );

    this.database.sqlite
      .prepare(
        `delete from workflow_events
         where id in (
           select id from workflow_events
           where project_workflow_key = ?
           order by created_at desc, id desc
           limit -1 offset ?
         )`,
      )
      .run(input.projectWorkflowKey, MAX_WORKFLOW_EVENTS);
  }

  private persistUserInputRecord(record: WorkspaceUserInputRecord): WorkspaceUserInputRecord {
    this.database.db
      .insert(workspaceUserInputs)
      .values({
        workspaceSessionId: record.workspaceSessionId,
        promptJson: JSON.stringify({
          questions: record.questions,
          autoResolutionMs: record.autoResolutionMs,
        }),
        status: record.status,
        deliveryMode: record.deliveryMode ?? null,
        responseJson: record.response ? JSON.stringify(record.response) : null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        answeredAt: record.answeredAt ?? null,
      })
      .onConflictDoUpdate({
        target: workspaceUserInputs.workspaceSessionId,
        set: {
          promptJson: JSON.stringify({
            questions: record.questions,
            autoResolutionMs: record.autoResolutionMs,
          }),
          status: record.status,
          deliveryMode: record.deliveryMode ?? null,
          responseJson: record.response ? JSON.stringify(record.response) : null,
          updatedAt: record.updatedAt,
          answeredAt: record.answeredAt ?? null,
        },
      })
      .run();

    return record;
  }

  private migrate(): void {
    this.database.sqlite.exec(`
      create table if not exists workspace_sessions (
        id text primary key,
        root text not null,
        status text not null default 'active',
        mode text not null default 'checkout',
        source_root text,
        base_ref text,
        base_sha text,
        managed text not null default 'false',
        created_at text not null,
        last_used_at text not null
      );

      create index if not exists workspace_sessions_root_idx
        on workspace_sessions(root, last_used_at desc);

      create index if not exists workspace_sessions_status_idx
        on workspace_sessions(status, last_used_at desc);

      create table if not exists loaded_agent_files (
        workspace_session_id text not null,
        path text not null,
        content_hash text not null,
        content text not null,
        loaded_at text not null,
        last_seen_at text not null,
        primary key (workspace_session_id, path),
        foreign key (workspace_session_id)
          references workspace_sessions(id)
          on delete cascade
      );

      create index if not exists loaded_agent_files_path_idx
        on loaded_agent_files(path);

      create table if not exists workspace_plans (
        workspace_session_id text primary key,
        explanation text,
        steps_json text not null,
        updated_at text not null,
        foreign key (workspace_session_id)
          references workspace_sessions(id)
          on delete cascade
      );

      create table if not exists workspace_goals (
        workspace_session_id text primary key,
        objective text not null,
        status text not null default 'active',
        token_budget text,
        created_at text not null,
        updated_at text not null,
        active_seconds text not null default '0',
        completed_at text,
        blocked_at text,
        foreign key (workspace_session_id)
          references workspace_sessions(id)
          on delete cascade
      );

      create index if not exists workspace_goals_status_idx
        on workspace_goals(status, updated_at desc);

      create table if not exists workspace_modes (
        workspace_session_id text primary key,
        mode text not null default 'default',
        updated_at text not null,
        foreign key (workspace_session_id)
          references workspace_sessions(id)
          on delete cascade
      );

      create table if not exists workspace_user_inputs (
        workspace_session_id text primary key,
        prompt_json text not null,
        status text not null default 'pending',
        delivery_mode text,
        response_json text,
        created_at text not null,
        updated_at text not null,
        answered_at text,
        foreign key (workspace_session_id)
          references workspace_sessions(id)
          on delete cascade
      );

      create table if not exists project_workflows (
        project_workflow_key text primary key,
        canonical_root text not null,
        workspace_kind text not null,
        git_common_dir text,
        git_remote_origin text,
        created_at text not null,
        updated_at text not null
      );

      create unique index if not exists project_workflows_root_idx
        on project_workflows(canonical_root);

      create table if not exists workflow_plans (
        id text primary key,
        project_workflow_key text not null,
        goal_id text,
        title text not null,
        summary text,
        scope_in_json text not null default '[]',
        scope_out_json text not null default '[]',
        validation_json text not null default '[]',
        risks_json text not null default '[]',
        status text not null,
        revision integer not null,
        is_current integer not null default 1,
        created_at text not null,
        updated_at text not null,
        archived_at text,
        foreign key (project_workflow_key)
          references project_workflows(project_workflow_key)
          on delete cascade
      );

      create unique index if not exists workflow_plans_current_idx
        on workflow_plans(project_workflow_key)
        where is_current = 1;

      create index if not exists workflow_plans_history_idx
        on workflow_plans(project_workflow_key, updated_at desc);

      create table if not exists workflow_plan_steps (
        id text primary key,
        plan_id text not null,
        position integer not null,
        content text not null,
        status text not null,
        note text,
        updated_at text not null,
        foreign key (plan_id)
          references workflow_plans(id)
          on delete cascade
      );

      create unique index if not exists workflow_plan_steps_position_idx
        on workflow_plan_steps(plan_id, position);

      create table if not exists workflow_goals (
        id text primary key,
        project_workflow_key text not null,
        objective text not null,
        scope_in_json text not null default '[]',
        scope_out_json text not null default '[]',
        success_criteria_json text not null default '[]',
        verification_json text not null default '[]',
        stop_conditions_json text not null default '[]',
        current_summary text,
        status text not null,
        revision integer not null,
        is_current integer not null default 1,
        created_at text not null,
        updated_at text not null,
        archived_at text,
        foreign key (project_workflow_key)
          references project_workflows(project_workflow_key)
          on delete cascade
      );

      create unique index if not exists workflow_goals_current_idx
        on workflow_goals(project_workflow_key)
        where is_current = 1;

      create index if not exists workflow_goals_history_idx
        on workflow_goals(project_workflow_key, updated_at desc);

      create table if not exists workflow_goal_metrics (
        goal_id text primary key,
        active_work_started_at text,
        accumulated_work_ms integer not null default 0,
        updated_at text not null,
        foreign key (goal_id)
          references workflow_goals(id)
          on delete cascade
      );

      create table if not exists workflow_goal_token_usage (
        id text primary key,
        goal_id text not null,
        provider text not null,
        provider_request_id text not null,
        model text,
        input_tokens integer not null,
        output_tokens integer not null,
        reasoning_tokens integer not null default 0,
        total_tokens integer not null,
        provider_reported_at text,
        recorded_at text not null,
        foreign key (goal_id)
          references workflow_goals(id)
          on delete cascade
      );

      create unique index if not exists workflow_goal_token_usage_dedupe_idx
        on workflow_goal_token_usage(goal_id, provider, provider_request_id);

      create index if not exists workflow_goal_token_usage_history_idx
        on workflow_goal_token_usage(goal_id, recorded_at desc);

      create table if not exists workflow_modes (
        project_workflow_key text primary key,
        mode text not null default 'default',
        updated_at text not null,
        foreign key (project_workflow_key)
          references project_workflows(project_workflow_key)
          on delete cascade
      );

      create table if not exists workflow_events (
        id text primary key,
        project_workflow_key text not null,
        entity_type text not null,
        entity_id text not null,
        event_type text not null,
        summary text not null,
        revision integer,
        created_at text not null,
        foreign key (project_workflow_key)
          references project_workflows(project_workflow_key)
          on delete cascade
      );

      create index if not exists workflow_events_history_idx
        on workflow_events(project_workflow_key, created_at desc, id desc);

      create table if not exists workflow_migrations (
        migration_key text primary key,
        completed_at text not null
      );
    `);

    this.addColumnIfMissing("workspace_sessions", "mode", "text not null default 'checkout'");
    this.addColumnIfMissing("workspace_sessions", "source_root", "text");
    this.addColumnIfMissing("workspace_sessions", "base_ref", "text");
    this.addColumnIfMissing("workspace_sessions", "base_sha", "text");
    this.addColumnIfMissing("workspace_sessions", "managed", "text not null default 'false'");
    this.addColumnIfMissing("workspace_goals", "active_seconds", "text not null default '0'");
    this.addColumnIfMissing("workspace_user_inputs", "delivery_mode", "text");
    this.addColumnIfMissing("workspace_user_inputs", "response_json", "text");
    this.addColumnIfMissing("workspace_user_inputs", "answered_at", "text");

    this.database.sqlite
      .prepare(
        `insert or ignore into workflow_goal_metrics (goal_id, active_work_started_at, accumulated_work_ms, updated_at)
         select id, null, 0, updated_at from workflow_goals`,
      )
      .run();

    this.migrateLegacyWorkflowState();
  }

  private migrateLegacyWorkflowState(): void {
    const migrationKey = "project-workflow-store-v2";
    const alreadyMigrated = this.database.sqlite
      .prepare("select migration_key from workflow_migrations where migration_key = ?")
      .get(migrationKey);
    if (alreadyMigrated) return;

    this.database.sqlite.transaction(() => {
      const sessions = this.database.sqlite
        .prepare("select id, root, mode from workspace_sessions")
        .all() as Array<{ id: string; root: string; mode: string }>;
      const workflows = new Map<string, { key: string; root: string; mode: WorkspaceMode }>();

      for (const session of sessions) {
        const mode: WorkspaceMode = session.mode === "worktree" ? "worktree" : "checkout";
        const workflow = this.ensureProjectWorkflow(session.root, mode);
        workflows.set(session.id, { key: workflow.key, root: workflow.canonicalRoot, mode });
      }

      const existingCurrentPlans = new Set(
        (this.database.sqlite
          .prepare("select project_workflow_key from workflow_plans where is_current = 1")
          .all() as Array<{ project_workflow_key: string }>)
          .map((row) => row.project_workflow_key),
      );
      const importedPlans = new Set<string>();
      const legacyPlans = this.database.sqlite
        .prepare(
          `select workspace_session_id, explanation, steps_json, updated_at
           from workspace_plans
           order by updated_at desc`,
        )
        .all() as LegacyPlanRow[];

      for (const legacy of legacyPlans) {
        const workflow = workflows.get(legacy.workspace_session_id);
        if (!workflow || existingCurrentPlans.has(workflow.key)) continue;
        const now = legacy.updated_at;
        const isCurrent = !importedPlans.has(workflow.key);
        const status: PlanStatus = isCurrent ? "active" : "archived";
        const archivedAt = isCurrent ? null : now;
        const planId = randomUUID();
        const steps = normalizePlanSteps(parseLegacyPlanSteps(legacy.steps_json), now);
        this.database.sqlite
          .prepare(
            `insert into workflow_plans (
              id, project_workflow_key, goal_id, title, summary,
              scope_in_json, scope_out_json, validation_json, risks_json,
              status, revision, is_current, created_at, updated_at, archived_at
            ) values (?, ?, null, ?, ?, '[]', '[]', '[]', '[]', ?, 1, ?, ?, ?, ?)`,
          )
          .run(
            planId,
            workflow.key,
            "Migrated workspace plan",
            legacy.explanation ?? null,
            status,
            isCurrent ? 1 : 0,
            now,
            now,
            archivedAt,
          );
        this.insertPlanSteps({
          id: planId,
          projectWorkflowKey: workflow.key,
          title: "Migrated workspace plan",
          summary: legacy.explanation ?? undefined,
          scopeIn: [],
          scopeOut: [],
          validation: [],
          risks: [],
          status,
          revision: 1,
          steps,
          createdAt: now,
          updatedAt: now,
          archivedAt: archivedAt ?? undefined,
        });
        this.recordWorkflowEvent({
          projectWorkflowKey: workflow.key,
          entityType: "plan",
          entityId: planId,
          eventType: isCurrent ? "plan.migrated" : "plan.archived_migrated",
          summary: isCurrent ? "Migrated legacy workspace plan." : "Archived older legacy workspace plan during migration.",
          revision: 1,
          createdAt: now,
        });
        if (isCurrent) importedPlans.add(workflow.key);
      }

      const existingCurrentGoals = new Set(
        (this.database.sqlite
          .prepare("select project_workflow_key from workflow_goals where is_current = 1")
          .all() as Array<{ project_workflow_key: string }>)
          .map((row) => row.project_workflow_key),
      );
      const importedGoals = new Set<string>();
      const legacyGoals = this.database.sqlite
        .prepare(
          `select workspace_session_id, objective, status, created_at, updated_at
           from workspace_goals
           order by updated_at desc`,
        )
        .all() as LegacyGoalRow[];

      for (const legacy of legacyGoals) {
        const workflow = workflows.get(legacy.workspace_session_id);
        if (!workflow || existingCurrentGoals.has(workflow.key)) continue;
        const parsed = parseGoalDefinition(legacy.objective).definition;
        const goalId = randomUUID();
        const isCurrent = !importedGoals.has(workflow.key);
        const status: GoalStatus = isCurrent ? normalizeGoalStatus(legacy.status) : "archived";
        const archivedAt = isCurrent ? null : legacy.updated_at;
        this.database.sqlite
          .prepare(
            `insert into workflow_goals (
              id, project_workflow_key, objective, scope_in_json, scope_out_json,
              success_criteria_json, verification_json, stop_conditions_json, current_summary,
              status, revision, is_current, created_at, updated_at, archived_at
            ) values (?, ?, ?, ?, ?, '[]', ?, ?, null, ?, 1, ?, ?, ?, ?)`,
          )
          .run(
            goalId,
            workflow.key,
            normalizeRequiredText(parsed.objective, "Goal objective"),
            JSON.stringify(parsed.scope?.in ?? []),
            JSON.stringify(parsed.scope?.out ?? []),
            JSON.stringify(parsed.verification ?? []),
            JSON.stringify(parsed.stopConditions ?? []),
            status,
            isCurrent ? 1 : 0,
            legacy.created_at,
            legacy.updated_at,
            archivedAt,
          );
        this.ensureGoalMetricsRecord(goalId, legacy.updated_at);
        this.recordWorkflowEvent({
          projectWorkflowKey: workflow.key,
          entityType: "goal",
          entityId: goalId,
          eventType: isCurrent ? "goal.migrated" : "goal.archived_migrated",
          summary: isCurrent ? "Migrated legacy workspace goal." : "Archived older legacy workspace goal during migration.",
          revision: 1,
          createdAt: legacy.updated_at,
        });
        if (isCurrent) importedGoals.add(workflow.key);
      }

      const existingModes = new Set(
        (this.database.sqlite
          .prepare("select project_workflow_key from workflow_modes")
          .all() as Array<{ project_workflow_key: string }>)
          .map((row) => row.project_workflow_key),
      );
      const importedModes = new Set<string>();
      const legacyModes = this.database.sqlite
        .prepare(
          `select workspace_session_id, mode, updated_at
           from workspace_modes
           order by updated_at desc`,
        )
        .all() as LegacyModeRow[];

      for (const legacy of legacyModes) {
        const workflow = workflows.get(legacy.workspace_session_id);
        if (!workflow || existingModes.has(workflow.key) || importedModes.has(workflow.key)) continue;
        this.database.sqlite
          .prepare(
            "insert into workflow_modes (project_workflow_key, mode, updated_at) values (?, ?, ?)",
          )
          .run(workflow.key, legacy.mode === "plan" ? "plan" : "default", legacy.updated_at);
        importedModes.add(workflow.key);
      }

      this.database.sqlite
        .prepare("insert into workflow_migrations (migration_key, completed_at) values (?, ?)")
        .run(migrationKey, new Date().toISOString());
    })();
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.database.sqlite.prepare(`pragma table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (columns.some((existingColumn) => existingColumn.name === column)) return;

    this.database.sqlite.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

export function createWorkspaceStore(stateDir: string): WorkspaceStore {
  return new SqliteWorkspaceStore(stateDir);
}

export function projectWorkflowKeyForRoot(root: string): string {
  return `pw_${createHash("sha256").update(`v1:${canonicalizeRoot(root)}`).digest("hex")}`;
}

function canonicalizeRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return resolve(root);
  }
}

function readGitIdentity(root: string): { commonDir?: string; remoteOrigin?: string } {
  const commonDir = runGitForMetadata(root, ["rev-parse", "--git-common-dir"]);
  if (!commonDir) return {};
  const remoteOrigin = runGitForMetadata(root, ["remote", "get-url", "origin"]);
  return {
    commonDir: canonicalizeRoot(resolve(root, commonDir)),
    remoteOrigin: remoteOrigin || undefined,
  };
}

function runGitForMetadata(root: string, args: string[]): string | undefined {
  try {
    const value = execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1_500,
    }).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function rowToWorkspaceSession(row: WorkspaceSessionRow): WorkspaceSession {
  return {
    id: row.id,
    root: row.root,
    status: row.status,
    mode: row.mode === "worktree" ? "worktree" : "checkout",
    sourceRoot: row.sourceRoot ?? undefined,
    baseRef: row.baseRef ?? undefined,
    baseSha: row.baseSha ?? undefined,
    managed: row.managed === "true",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function rowToWorkspaceGoal(row: WorkflowGoalRow): WorkspaceGoal {
  return {
    id: row.id,
    projectWorkflowKey: row.project_workflow_key,
    objective: row.objective,
    scopeIn: parseStringList(row.scope_in_json),
    scopeOut: parseStringList(row.scope_out_json),
    successCriteria: parseStringList(row.success_criteria_json),
    verification: parseStringList(row.verification_json),
    stopConditions: parseStringList(row.stop_conditions_json),
    currentSummary: row.current_summary ?? undefined,
    status: normalizeGoalStatus(row.status),
    revision: Number(row.revision),
    metrics: emptyGoalMetrics(row.updated_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

function rowToWorkspaceUserInput(row: WorkspaceUserInputRow): WorkspaceUserInputRecord {
  const parsedPrompt = JSON.parse(row.promptJson) as {
    questions?: WorkspaceQuestion[];
    autoResolutionMs?: number;
  };
  const parsedResponse = row.responseJson
    ? (JSON.parse(row.responseJson) as WorkspaceUserInputResponse)
    : undefined;

  return {
    workspaceSessionId: row.workspaceSessionId,
    questions: Array.isArray(parsedPrompt.questions) ? parsedPrompt.questions : [],
    autoResolutionMs:
      typeof parsedPrompt.autoResolutionMs === "number"
        ? parsedPrompt.autoResolutionMs
        : undefined,
    status: normalizeUserInputStatus(row.status),
    deliveryMode: normalizeUserInputDeliveryMode(row.deliveryMode),
    response: parsedResponse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    answeredAt: row.answeredAt ?? undefined,
  };
}

function emptyGoalMetrics(measuredAt: string): GoalMetrics {
  return {
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      reportCount: 0,
    },
    workDuration: {
      running: false,
      accumulatedMilliseconds: 0,
      liveMilliseconds: 0,
      totalMilliseconds: 0,
      measuredAt,
    },
    progress: unlinkedGoalProgress(),
  };
}

function unlinkedGoalProgress(): GoalProgress {
  return {
    source: "unlinked",
    completedSteps: 0,
    totalSteps: 0,
  };
}

function goalProgressFromPlan(plan: WorkspacePlan): GoalProgress {
  const completedSteps = plan.steps.filter((step) => step.status === "completed").length;
  const totalSteps = plan.steps.length;
  if (totalSteps === 0) return unlinkedGoalProgress();

  return {
    source: "linked_plan_steps",
    completedSteps,
    totalSteps,
    exactFraction: `${completedSteps}/${totalSteps}`,
    percentageNumerator: completedSteps * 100,
    percentageDenominator: totalSteps,
    displayPercent: formatExactPercent(completedSteps, totalSteps),
  };
}

function formatExactPercent(completed: number, total: number): string {
  const scale = 100n;
  const numerator = BigInt(completed) * 100n * scale;
  const denominator = BigInt(total);
  const rounded = (numerator + denominator / 2n) / denominator;
  const integer = rounded / scale;
  const decimal = (rounded % scale).toString().padStart(2, "0");
  return `${integer}.${decimal}%`;
}

function elapsedMilliseconds(startedAt: string, measuredAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(measuredAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function maxIsoTimestamp(...values: Array<string | null | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function validateTokenUsage(input: {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  providerReportedAt?: string;
}): void {
  for (const [label, value] of [
    ["inputTokens", input.inputTokens],
    ["outputTokens", input.outputTokens],
    ["reasoningTokens", input.reasoningTokens ?? 0],
    ["totalTokens", input.totalTokens],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer reported by the provider.`);
    }
  }
  if (input.providerReportedAt && !Number.isFinite(Date.parse(input.providerReportedAt))) {
    throw new Error("providerReportedAt must be a valid ISO timestamp.");
  }
}

function normalizePlanSteps(steps: WorkspacePlanStep[], updatedAt: string): WorkspacePlanStep[] {
  return steps.map((step) => ({
    id: step.id ?? randomUUID(),
    step: normalizeRequiredText(step.step, "Plan step"),
    status: normalizePlanStepStatus(step.status),
    note: normalizeOptionalText(step.note, MAX_WORKFLOW_TEXT_BYTES),
    updatedAt,
  }));
}

function parseLegacyPlanSteps(value: string): WorkspacePlanStep[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as { step?: unknown; content?: unknown; status?: unknown; note?: unknown };
      const step = typeof candidate.step === "string"
        ? candidate.step
        : typeof candidate.content === "string"
          ? candidate.content
          : undefined;
      if (!step) return [];
      return [{
        step,
        status: normalizePlanStepStatus(typeof candidate.status === "string" ? candidate.status : "pending"),
        note: typeof candidate.note === "string" ? candidate.note : undefined,
      }];
    });
  } catch {
    return [];
  }
}

function validatePlanSteps(steps: WorkspacePlanStep[]): void {
  if (steps.length === 0) {
    throw new Error("A plan must include at least one step.");
  }
  if (steps.length > 100) {
    throw new Error("A plan may not contain more than 100 steps.");
  }
  const inProgressCount = steps.filter((step) => step.status === "in_progress").length;
  if (inProgressCount > 1) {
    throw new Error("A plan may have at most one in_progress step.");
  }
}

function normalizePlanStatus(value: string): PlanStatus {
  if (value === "draft" || value === "completed" || value === "archived") return value;
  return "active";
}

function normalizePlanStepStatus(value: string): PlanStepStatus {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "blocked" ||
    value === "completed" ||
    value === "skipped"
  ) {
    return value;
  }
  return "pending";
}

function normalizeGoalStatus(value: string): GoalStatus {
  if (value === "blocked" || value === "completed" || value === "archived") return value;
  if (value === "complete") return "completed";
  return "active";
}

function normalizeStringList(values: string[]): string[] {
  const normalized = values
    .map((value) => normalizeOptionalText(value, MAX_WORKFLOW_TEXT_BYTES))
    .filter((value): value is string => Boolean(value));
  const serialized = JSON.stringify(normalized);
  assertTextLimit(serialized, MAX_WORKFLOW_TEXT_BYTES, "Workflow list");
  return normalized;
}

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  assertTextLimit(normalized, MAX_WORKFLOW_TEXT_BYTES, label);
  return normalized;
}

function normalizeOptionalText(value: string | undefined, maxBytes: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  assertTextLimit(normalized, maxBytes, "Workflow text");
  return normalized;
}

function assertTextLimit(value: string, maxBytes: number, label: string): void {
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit.`);
  }
}

function truncateText(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let end = Math.max(0, Math.floor(maxBytes / 2));
  while (Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes - 3 && end > 0) end--;
  return `${value.slice(0, end)}...`;
}

function normalizeUserInputStatus(value: string): UserInputStatus {
  if (value === "completed" || value === "declined" || value === "cancelled") {
    return value;
  }
  return "pending";
}

function normalizeUserInputDeliveryMode(
  value: string | null,
): UserInputDeliveryMode | undefined {
  if (value === "elicitation" || value === "tool" || value === "ui") {
    return value;
  }
  return undefined;
}

function encodeHistoryCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeHistoryCursor(cursor: string | undefined): { createdAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("invalid cursor");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new Error("Invalid workflow history cursor.");
  }
}

function rowToWorkflowEvent(row: WorkflowEventRow): WorkflowEvent {
  return {
    id: row.id,
    projectWorkflowKey: row.project_workflow_key,
    entityType: row.entity_type === "goal" || row.entity_type === "mode" ? row.entity_type : "plan",
    entityId: row.entity_id,
    eventType: row.event_type,
    summary: row.summary,
    revision: row.revision === null ? undefined : Number(row.revision),
    createdAt: row.created_at,
  };
}

interface GoalMetricsRow {
  active_work_started_at: string | null;
  accumulated_work_ms: number;
  updated_at: string;
}

interface GoalTokenUsageRow {
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  report_count: number | null;
  last_reported_at: string | null;
}

interface WorkflowPlanRow {
  id: string;
  project_workflow_key: string;
  goal_id: string | null;
  title: string;
  summary: string | null;
  scope_in_json: string;
  scope_out_json: string;
  validation_json: string;
  risks_json: string;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface WorkflowPlanStepRow {
  id: string;
  position: number;
  content: string;
  status: string;
  note: string | null;
  updated_at: string;
}

interface WorkflowGoalRow {
  id: string;
  project_workflow_key: string;
  objective: string;
  scope_in_json: string;
  scope_out_json: string;
  success_criteria_json: string;
  verification_json: string;
  stop_conditions_json: string;
  current_summary: string | null;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface WorkflowEventRow {
  id: string;
  project_workflow_key: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  summary: string;
  revision: number | null;
  created_at: string;
}

interface LegacyPlanRow {
  workspace_session_id: string;
  explanation: string | null;
  steps_json: string;
  updated_at: string;
}

interface LegacyGoalRow {
  workspace_session_id: string;
  objective: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface LegacyModeRow {
  workspace_session_id: string;
  mode: string;
  updated_at: string;
}
