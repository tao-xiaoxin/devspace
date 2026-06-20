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
assert.match(instructions, /When available skills include a matching workflow skill, read that skill before handling slash-style workspace commands or compact user-input replies\./);
assert.match(instructions, /For concise workflow commands and compact pending-input replies, prefer handle_workspace_command or answer_user_input\(text\) over paraphrasing the user's message\./);

const planInstruction = workspaceInstruction("plan", false);
assert.match(planInstruction, /ask clarifying questions with request_user_input only when they materially affect the plan/);
assert.match(planInstruction, /Keep the plan decision complete but compact\./);
assert.match(planInstruction, /Do not repeat already-confirmed choices, do not add long design essays/);

const defaultInstruction = workspaceInstruction("default", false);
assert.match(defaultInstruction, /execute work directly, keep status updates brief/);
assert.match(defaultInstruction, /Do not add unnecessary explanation for straightforward actions or results\./);
