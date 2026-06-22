import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaceSessions = sqliteTable(
  "workspace_sessions",
  {
    id: text("id").primaryKey(),
    root: text("root").notNull(),
    status: text("status").notNull().default("active"),
    mode: text("mode").notNull().default("checkout"),
    sourceRoot: text("source_root"),
    baseRef: text("base_ref"),
    baseSha: text("base_sha"),
    managed: text("managed").notNull().default("false"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    index("workspace_sessions_root_idx").on(table.root, table.lastUsedAt),
    index("workspace_sessions_status_idx").on(table.status, table.lastUsedAt),
  ],
);

export const loadedAgentFiles = sqliteTable(
  "loaded_agent_files",
  {
    workspaceSessionId: text("workspace_session_id")
      .notNull()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
    loadedAt: text("loaded_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceSessionId, table.path] }),
    index("loaded_agent_files_path_idx").on(table.path),
  ],
);

export const workspacePlans = sqliteTable(
  "workspace_plans",
  {
    workspaceSessionId: text("workspace_session_id")
      .primaryKey()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    explanation: text("explanation"),
    stepsJson: text("steps_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const workspaceGoals = sqliteTable(
  "workspace_goals",
  {
    workspaceSessionId: text("workspace_session_id")
      .primaryKey()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    status: text("status").notNull().default("active"),
    tokenBudget: text("token_budget"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    activeSeconds: text("active_seconds").notNull().default("0"),
    completedAt: text("completed_at"),
    blockedAt: text("blocked_at"),
  },
  (table) => [index("workspace_goals_status_idx").on(table.status, table.updatedAt)],
);

export const workspaceModes = sqliteTable(
  "workspace_modes",
  {
    workspaceSessionId: text("workspace_session_id")
      .primaryKey()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("default"),
    updatedAt: text("updated_at").notNull(),
  },
);

export const projectWorkflows = sqliteTable(
  "project_workflows",
  {
    projectWorkflowKey: text("project_workflow_key").primaryKey(),
    canonicalRoot: text("canonical_root").notNull(),
    workspaceKind: text("workspace_kind").notNull(),
    gitCommonDir: text("git_common_dir"),
    gitRemoteOrigin: text("git_remote_origin"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("project_workflows_root_idx").on(table.canonicalRoot)],
);

export const workflowPlans = sqliteTable(
  "workflow_plans",
  {
    id: text("id").primaryKey(),
    projectWorkflowKey: text("project_workflow_key")
      .notNull()
      .references(() => projectWorkflows.projectWorkflowKey, { onDelete: "cascade" }),
    goalId: text("goal_id"),
    title: text("title").notNull(),
    summary: text("summary"),
    scopeInJson: text("scope_in_json").notNull(),
    scopeOutJson: text("scope_out_json").notNull(),
    validationJson: text("validation_json").notNull(),
    risksJson: text("risks_json").notNull(),
    status: text("status").notNull(),
    revision: integer("revision").notNull(),
    isCurrent: integer("is_current").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [index("workflow_plans_history_idx").on(table.projectWorkflowKey, table.updatedAt)],
);

export const workflowPlanSteps = sqliteTable(
  "workflow_plan_steps",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => workflowPlans.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull(),
    note: text("note"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("workflow_plan_steps_plan_idx").on(table.planId, table.position)],
);

export const workflowGoals = sqliteTable(
  "workflow_goals",
  {
    id: text("id").primaryKey(),
    projectWorkflowKey: text("project_workflow_key")
      .notNull()
      .references(() => projectWorkflows.projectWorkflowKey, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    scopeInJson: text("scope_in_json").notNull(),
    scopeOutJson: text("scope_out_json").notNull(),
    successCriteriaJson: text("success_criteria_json").notNull(),
    verificationJson: text("verification_json").notNull(),
    stopConditionsJson: text("stop_conditions_json").notNull(),
    currentSummary: text("current_summary"),
    status: text("status").notNull(),
    revision: integer("revision").notNull(),
    isCurrent: integer("is_current").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [index("workflow_goals_history_idx").on(table.projectWorkflowKey, table.updatedAt)],
);

export const workflowGoalMetrics = sqliteTable(
  "workflow_goal_metrics",
  {
    goalId: text("goal_id")
      .primaryKey()
      .references(() => workflowGoals.id, { onDelete: "cascade" }),
    activeWorkStartedAt: text("active_work_started_at"),
    accumulatedWorkMs: integer("accumulated_work_ms").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const workflowGoalTokenUsage = sqliteTable(
  "workflow_goal_token_usage",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => workflowGoals.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerRequestId: text("provider_request_id").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    reasoningTokens: integer("reasoning_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    providerReportedAt: text("provider_reported_at"),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_goal_token_usage_dedupe_idx").on(
      table.goalId,
      table.provider,
      table.providerRequestId,
    ),
    index("workflow_goal_token_usage_history_idx").on(table.goalId, table.recordedAt),
  ],
);

export const workflowModes = sqliteTable(
  "workflow_modes",
  {
    projectWorkflowKey: text("project_workflow_key")
      .primaryKey()
      .references(() => projectWorkflows.projectWorkflowKey, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const workflowEvents = sqliteTable(
  "workflow_events",
  {
    id: text("id").primaryKey(),
    projectWorkflowKey: text("project_workflow_key")
      .notNull()
      .references(() => projectWorkflows.projectWorkflowKey, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    revision: integer("revision"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("workflow_events_history_idx").on(table.projectWorkflowKey, table.createdAt)],
);

export const workspaceUserInputs = sqliteTable(
  "workspace_user_inputs",
  {
    workspaceSessionId: text("workspace_session_id")
      .primaryKey()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    promptJson: text("prompt_json").notNull(),
    status: text("status").notNull().default("pending"),
    deliveryMode: text("delivery_mode"),
    responseJson: text("response_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    answeredAt: text("answered_at"),
  },
);

export const oauthClients = sqliteTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientJson: text("client_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const oauthAuthorizationCodes = sqliteTable(
  "oauth_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    paramsJson: text("params_json").notNull(),
    expiresAtMs: integer("expires_at_ms").notNull(),
  },
  (table) => [index("oauth_authorization_codes_expiry_idx").on(table.expiresAtMs)],
);

export const oauthAccessTokens = sqliteTable("oauth_access_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  scopesJson: text("scopes_json").notNull(),
  expiresAt: integer("expires_at").notNull(),
  resource: text("resource"),
});

export const oauthRefreshTokens = sqliteTable("oauth_refresh_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  scopesJson: text("scopes_json").notNull(),
  expiresAt: integer("expires_at").notNull(),
  resource: text("resource"),
});

export const oauthConsents = sqliteTable(
  "oauth_consents",
  {
    consentKey: text("consent_key").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    resource: text("resource").notNull(),
    scopesJson: text("scopes_json").notNull(),
    approvedAt: integer("approved_at").notNull(),
  },
  (table) => [index("oauth_consents_client_idx").on(table.clientId)],
);

export const oauthMetadata = sqliteTable("oauth_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type WorkspaceSessionRow = typeof workspaceSessions.$inferSelect;
export type NewWorkspaceSessionRow = typeof workspaceSessions.$inferInsert;
export type LoadedAgentFileRow = typeof loadedAgentFiles.$inferSelect;
export type NewLoadedAgentFileRow = typeof loadedAgentFiles.$inferInsert;
export type WorkspacePlanRow = typeof workspacePlans.$inferSelect;
export type NewWorkspacePlanRow = typeof workspacePlans.$inferInsert;
export type WorkspaceGoalRow = typeof workspaceGoals.$inferSelect;
export type NewWorkspaceGoalRow = typeof workspaceGoals.$inferInsert;
export type WorkspaceModeRow = typeof workspaceModes.$inferSelect;
export type NewWorkspaceModeRow = typeof workspaceModes.$inferInsert;
export type WorkspaceUserInputRow = typeof workspaceUserInputs.$inferSelect;
export type NewWorkspaceUserInputRow = typeof workspaceUserInputs.$inferInsert;
export type ProjectWorkflowRow = typeof projectWorkflows.$inferSelect;
export type WorkflowPlanRow = typeof workflowPlans.$inferSelect;
export type WorkflowPlanStepRow = typeof workflowPlanSteps.$inferSelect;
export type WorkflowGoalRow = typeof workflowGoals.$inferSelect;
export type WorkflowGoalMetricsRow = typeof workflowGoalMetrics.$inferSelect;
export type WorkflowGoalTokenUsageRow = typeof workflowGoalTokenUsage.$inferSelect;
export type WorkflowModeRow = typeof workflowModes.$inferSelect;
export type WorkflowEventRow = typeof workflowEvents.$inferSelect;
