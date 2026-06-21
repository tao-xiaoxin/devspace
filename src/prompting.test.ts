import assert from "node:assert/strict";
import { serverInstructions, workspaceInstruction } from "./prompting.js";
import type { ToolNames } from "./server.js";

const toolNames: ToolNames = {
  openWorkspace: "open_workspace",
  read: "read_file",
  write: "write_file",
  edit: "edit_file",
  grep: "grep_files",
  glob: "find_files",
  ls: "list_directory",
  shell: "run_shell",
};

const instructions = serverInstructions(
  {
    minimalTools: false,
    skillsEnabled: false,
    widgetsChangesOnly: false,
  },
  toolNames,
);

assert.match(instructions, /Prefer action over explanation\./);
assert.match(instructions, /Keep responses terse and operational\./);
assert.match(instructions, /Do not add long design discussion, repeated background, or speculative future improvements unless the user explicitly asks for them\./);
assert.match(instructions, /When the user sends a short reply such as '1B, 2A', treat it as workflow input and continue instead of explaining the mechanism back to them\./);
assert.match(instructions, /When the user mentions a Skill name, \/plan, or \/goal, use resolve_skill to load the relevant SKILL\.md instructions\./);
assert.match(instructions, /Plan and Goal as project-scoped shared workflow state/);
assert.match(instructions, /open_workspace returns only workflowDigest/);
assert.match(instructions, /update_plan is allowed in plan mode/);
assert.match(instructions, /\/plan always resolves to DevSpace's system plan Skill/);
assert.match(instructions, /Treat \/plan and \/goal as aliases, not native ChatGPT slash commands\./);
assert.match(instructions, /Use handle_workspace_command only for compact pending-input replies or legacy workflow compatibility\./);

const planInstruction = workspaceInstruction("plan", false);
assert.match(planInstruction, /ask clarifying questions with request_user_input only when they materially affect the Plan/);
assert.match(planInstruction, /use update_plan with its expectedRevision to persist the revised Plan/);
assert.match(planInstruction, /Do not modify project files while plan mode is active\./);

const defaultInstruction = workspaceInstruction("default", false);
assert.match(defaultInstruction, /execute work directly, keep status updates brief/);
assert.match(defaultInstruction, /Do not add unnecessary explanation for straightforward actions or results\./);
