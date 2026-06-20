import { eq } from "drizzle-orm";
import { openDatabase, type DatabaseHandle } from "./db/client.js";
import {
  workspaceSessions,
  workspacePlans,
  workspaceGoals,
  workspaceModes,
  workspaceUserInputs,
  type WorkspaceSessionRow,
  type WorkspacePlanRow,
  type WorkspaceGoalRow,
  type WorkspaceModeRow,
  type WorkspaceUserInputRow,
} from "./db/schema.js";

export type WorkspaceMode = "checkout" | "worktree";
export type CollaborationMode = "default" | "plan";
export type UserInputStatus = "pending" | "completed" | "declined" | "cancelled";
export type UserInputDeliveryMode = "elicitation" | "tool" | "ui";

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
  step: string;
  status: "pending" | "in_progress" | "completed";
}

export interface WorkspacePlan {
  workspaceSessionId: string;
  explanation?: string;
  steps: WorkspacePlanStep[];
  updatedAt: string;
}

export interface WorkspaceGoal {
  workspaceSessionId: string;
  objective: string;
  status: "active" | "complete" | "blocked";
  tokenBudget?: number;
  createdAt: string;
  updatedAt: string;
  timeUsedSeconds: number;
  completedAt?: string;
  blockedAt?: string;
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
  savePlan(input: {
    workspaceSessionId: string;
    explanation?: string;
    steps: WorkspacePlanStep[];
  }): WorkspacePlan;
  getPlan(workspaceSessionId: string): WorkspacePlan | undefined;
  saveGoal(input: {
    workspaceSessionId: string;
    objective: string;
    tokenBudget?: number;
  }): WorkspaceGoal;
  getGoal(workspaceSessionId: string): WorkspaceGoal | undefined;
  updateGoalStatus(input: {
    workspaceSessionId: string;
    status: "complete" | "blocked";
  }): WorkspaceGoal;
  setCollaborationMode(input: {
    workspaceSessionId: string;
    mode: CollaborationMode;
  }): {
    workspaceSessionId: string;
    mode: CollaborationMode;
    updatedAt: string;
  };
  getCollaborationMode(workspaceSessionId: string): {
    workspaceSessionId: string;
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

  savePlan(input: {
    workspaceSessionId: string;
    explanation?: string;
    steps: WorkspacePlanStep[];
  }): WorkspacePlan {
    const updatedAt = new Date().toISOString();
    const plan: WorkspacePlan = {
      workspaceSessionId: input.workspaceSessionId,
      explanation: input.explanation,
      steps: input.steps,
      updatedAt,
    };

    this.database.db
      .insert(workspacePlans)
      .values({
        workspaceSessionId: plan.workspaceSessionId,
        explanation: plan.explanation ?? null,
        stepsJson: JSON.stringify(plan.steps),
        updatedAt: plan.updatedAt,
      })
      .onConflictDoUpdate({
        target: workspacePlans.workspaceSessionId,
        set: {
          explanation: plan.explanation ?? null,
          stepsJson: JSON.stringify(plan.steps),
          updatedAt: plan.updatedAt,
        },
      })
      .run();

    return plan;
  }

  getPlan(workspaceSessionId: string): WorkspacePlan | undefined {
    const row = this.database.db
      .select()
      .from(workspacePlans)
      .where(eq(workspacePlans.workspaceSessionId, workspaceSessionId))
      .get();

    return row ? rowToWorkspacePlan(row) : undefined;
  }

  saveGoal(input: {
    workspaceSessionId: string;
    objective: string;
    tokenBudget?: number;
  }): WorkspaceGoal {
    const existing = this.getGoal(input.workspaceSessionId);
    if (existing && existing.status === "active") {
      throw new Error("An active goal already exists for this workspace.");
    }

    const now = new Date().toISOString();
    const goal: WorkspaceGoal = {
      workspaceSessionId: input.workspaceSessionId,
      objective: input.objective,
      status: "active",
      tokenBudget: input.tokenBudget,
      createdAt: now,
      updatedAt: now,
      timeUsedSeconds: 0,
    };

    this.database.db
      .insert(workspaceGoals)
      .values({
        workspaceSessionId: goal.workspaceSessionId,
        objective: goal.objective,
        status: goal.status,
        tokenBudget: goal.tokenBudget === undefined ? null : String(goal.tokenBudget),
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
        activeSeconds: "0",
        completedAt: null,
        blockedAt: null,
      })
      .onConflictDoUpdate({
        target: workspaceGoals.workspaceSessionId,
        set: {
          objective: goal.objective,
          status: goal.status,
          tokenBudget: goal.tokenBudget === undefined ? null : String(goal.tokenBudget),
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
          activeSeconds: "0",
          completedAt: null,
          blockedAt: null,
        },
      })
      .run();

    return goal;
  }

  getGoal(workspaceSessionId: string): WorkspaceGoal | undefined {
    const row = this.database.db
      .select()
      .from(workspaceGoals)
      .where(eq(workspaceGoals.workspaceSessionId, workspaceSessionId))
      .get();

    return row ? rowToWorkspaceGoal(row) : undefined;
  }

  updateGoalStatus(input: {
    workspaceSessionId: string;
    status: "complete" | "blocked";
  }): WorkspaceGoal {
    const existing = this.getGoal(input.workspaceSessionId);
    if (!existing) {
      throw new Error("No goal exists for this workspace.");
    }
    if (existing.status !== "active") {
      throw new Error(`Goal is already ${existing.status}. Create a new goal to continue.`);
    }

    const updatedAt = new Date().toISOString();
    const completedAt = input.status === "complete" ? updatedAt : null;
    const blockedAt = input.status === "blocked" ? updatedAt : null;
    const activeSeconds = calculateGoalActiveSeconds(existing, updatedAt);

    this.database.db
      .update(workspaceGoals)
      .set({
        status: input.status,
        updatedAt,
        activeSeconds: String(activeSeconds),
        completedAt,
        blockedAt,
      })
      .where(eq(workspaceGoals.workspaceSessionId, input.workspaceSessionId))
      .run();

    const updated = this.getGoal(input.workspaceSessionId);
    if (!updated) {
      throw new Error("Failed to reload goal after update.");
    }

    return updated;
  }

  setCollaborationMode(input: {
    workspaceSessionId: string;
    mode: CollaborationMode;
  }): {
    workspaceSessionId: string;
    mode: CollaborationMode;
    updatedAt: string;
  } {
    const updatedAt = new Date().toISOString();

    this.database.db
      .insert(workspaceModes)
      .values({
        workspaceSessionId: input.workspaceSessionId,
        mode: input.mode,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: workspaceModes.workspaceSessionId,
        set: {
          mode: input.mode,
          updatedAt,
        },
      })
      .run();

    return {
      workspaceSessionId: input.workspaceSessionId,
      mode: input.mode,
      updatedAt,
    };
  }

  getCollaborationMode(workspaceSessionId: string): {
    workspaceSessionId: string;
    mode: CollaborationMode;
    updatedAt: string;
  } {
    const row = this.database.db
      .select()
      .from(workspaceModes)
      .where(eq(workspaceModes.workspaceSessionId, workspaceSessionId))
      .get();

    return row
      ? rowToWorkspaceMode(row)
      : {
          workspaceSessionId,
          mode: "default",
          updatedAt: "",
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

function rowToWorkspacePlan(row: WorkspacePlanRow): WorkspacePlan {
  return {
    workspaceSessionId: row.workspaceSessionId,
    explanation: row.explanation ?? undefined,
    steps: parsePlanSteps(row.stepsJson),
    updatedAt: row.updatedAt,
  };
}

function rowToWorkspaceGoal(row: WorkspaceGoalRow): WorkspaceGoal {
  return {
    workspaceSessionId: row.workspaceSessionId,
    objective: row.objective,
    status:
      row.status === "complete" ? "complete" : row.status === "blocked" ? "blocked" : "active",
    tokenBudget: row.tokenBudget === null ? undefined : Number(row.tokenBudget),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    timeUsedSeconds: computePersistedGoalTimeUsedSeconds(
      row.createdAt,
      row.updatedAt,
      row.activeSeconds,
      row.status,
    ),
    completedAt: row.completedAt ?? undefined,
    blockedAt: row.blockedAt ?? undefined,
  };
}

function rowToWorkspaceMode(row: WorkspaceModeRow): {
  workspaceSessionId: string;
  mode: CollaborationMode;
  updatedAt: string;
} {
  return {
    workspaceSessionId: row.workspaceSessionId,
    mode: row.mode === "plan" ? "plan" : "default",
    updatedAt: row.updatedAt,
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

function parsePlanSteps(value: string): WorkspacePlanStep[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const step = "step" in item && typeof item.step === "string" ? item.step : undefined;
    const status =
      "status" in item && typeof item.status === "string" ? item.status : undefined;
    if (!step) return [];
    if (status !== "pending" && status !== "in_progress" && status !== "completed") return [];

    return [{ step, status }];
  });
}

function calculateGoalActiveSeconds(existing: WorkspaceGoal, updatedAt: string): number {
  const createdAtMs = Date.parse(existing.createdAt);
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(updatedAtMs)) {
    return existing.timeUsedSeconds;
  }

  return Math.max(existing.timeUsedSeconds, Math.floor((updatedAtMs - createdAtMs) / 1000));
}

function computePersistedGoalTimeUsedSeconds(
  createdAt: string,
  updatedAt: string,
  activeSeconds: string | null,
  status: string,
): number {
  const persisted = activeSeconds === null ? NaN : Number(activeSeconds);
  if (Number.isFinite(persisted)) {
    if (status === "active") {
      const createdAtMs = Date.parse(createdAt);
      const updatedAtMs = Date.now();
      if (Number.isFinite(createdAtMs) && Number.isFinite(updatedAtMs)) {
        return Math.max(persisted, Math.floor((updatedAtMs - createdAtMs) / 1000));
      }
    }

    return persisted;
  }

  const createdAtMs = Date.parse(createdAt);
  const endMs = status === "active" ? Date.now() : Date.parse(updatedAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - createdAtMs) / 1000));
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
