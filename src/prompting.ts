import type { ToolNames } from "./server.js";

export type CollaborationMode = "default" | "plan";

export interface PromptingContext {
  minimalTools: boolean;
  skillsEnabled: boolean;
  widgetsChangesOnly: boolean;
}

export function serverInstructions(
  context: PromptingContext,
  toolNames: ToolNames,
): string {
  const inspection = context.minimalTools
    ? `In minimal tool mode, ${toolNames.grep}, ${toolNames.glob}, and ${toolNames.ls} are disabled; use ${toolNames.shell} with command-line tools such as grep, rg, find, ls, and tree for search and directory inspection. `
    : `Prefer ${toolNames.read}, ${toolNames.grep}, ${toolNames.glob}, and ${toolNames.ls} for file inspection. `;

  const skills = context.skillsEnabled
    ? `When a task matches a Skill, use resolve_skill to load its SKILL.md instructions. Use search_skills to discover optional project-local, installed, and global Skills without loading all of them. Skill resources use skill:// locators; ${toolNames.read} only permits the resolved SKILL.md and resources under an activated Skill directory. `
    : "";

  const agentsMd = `Follow instructions returned by ${toolNames.openWorkspace}. Before working under a path listed in availableAgentsFiles, use ${toolNames.read} to inspect that instruction file and follow it. `;

  const showChanges = context.widgetsChangesOnly
    ? " After creating, editing, or overwriting files, call show_changes once after the related file changes are complete so the user can see the aggregate diff."
    : "";

  const planning =
    " Treat Plan and Goal as project-scoped shared workflow state, not chat memory or a project-management system. open_workspace returns only workflowDigest; call get_plan or get_goal only when their full state is needed. Before changing a Plan or Goal, read its revision and pass expectedRevision to update_plan or update_goal. In plan mode, inspect and ask material questions first, then persist the approved Plan with update_plan; update_plan is allowed in plan mode. Use get_workflow_history only when a concise historical event is relevant.";

  const style =
    " Prefer action over explanation. Keep responses terse and operational. For mode switches, goal updates, confirmations, cancellations, pending answers, and other straightforward workflow steps, return only the necessary status or next action. Do not add long design discussion, repeated background, or speculative future improvements unless the user explicitly asks for them. When the user sends a short reply such as '1B, 2A', treat it as workflow input and continue instead of explaining the mechanism back to them.";

  const commands =
    " When the user mentions a Skill name, /plan, or /goal, use resolve_skill to load the relevant SKILL.md instructions. /plan always resolves to DevSpace's system plan Skill and /goal always resolves to its system goal Skill; local, installed, and global Skills do not override these aliases. Treat /plan and /goal as aliases, not native ChatGPT slash commands. Use handle_workspace_command only for compact pending-input replies or legacy workflow compatibility. For concise pending-input replies, prefer answer_user_input(text) over paraphrasing the user's message.";

  return `Use DevSpace as a local coding workspace. Call ${toolNames.openWorkspace} once per project folder or worktree to obtain a workspaceId. Reuse that same workspaceId for all later file, search, edit, write, show-changes, shell, skill, plan, and goal tools in that folder; do not call ${toolNames.openWorkspace} again unless switching folders/worktrees, changing checkout/worktree mode, the workspaceId is rejected as unknown, or the user explicitly asks to reopen. ${agentsMd}${skills}${inspection}${planning}${style}${commands} Prefer ${toolNames.edit} for targeted modifications, ${toolNames.write} only for new files or complete rewrites, apply_workspace_patch for coordinated multi-file patches, and ${toolNames.shell} for tests, builds, git inspection, package scripts, and commands that are better executed by the shell. Use git_push for explicit push requests instead of raw git push through ${toolNames.shell}. Do not create or modify files with ${toolNames.shell}; avoid shell redirection, heredocs, tee, sed -i, perl -i, node/python/ruby scripts, or any command whose purpose is to write project files.${showChanges}`;
}

export function workspaceInstruction(
  mode: CollaborationMode,
  skillsEnabled: boolean,
): string {
  const base = skillsEnabled
    ? "Use this workspaceId in all subsequent tool calls for this project. Do not call open_workspace again for this same folder unless this workspaceId stops working, the user asks to reopen, or you switch to a different folder/worktree. Follow loaded agentsFiles instructions. Before working under a path listed in availableAgentsFiles, read that instruction file. Use resolve_skill for task-matched Skills and search_skills for optional Skill discovery."
    : "Use this workspaceId in all subsequent tool calls for this project. Do not call open_workspace again for this same folder unless this workspaceId stops working, the user asks to reopen, or you switch to a different folder/worktree. Follow loaded agentsFiles instructions. Before working under a path listed in availableAgentsFiles, read that instruction file.";

  if (mode === "plan") {
    return `${base} This workspace is currently in plan mode: explore first, ask clarifying questions with request_user_input only when they materially affect the Plan, and produce a concrete implementation plan before execution. Read get_plan when a prior Plan exists, then use update_plan with its expectedRevision to persist the revised Plan. Do not modify project files while plan mode is active.`;
  }

  return `${base} This workspace is currently in default mode: execute work directly, keep status updates brief, and keep the current Plan and Goal accurate when they are relevant. Do not add unnecessary explanation for straightforward actions or results.`;
}
