import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  (table) => [
    index("workspace_goals_status_idx").on(table.status, table.updatedAt),
  ],
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
