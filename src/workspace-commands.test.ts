import assert from "node:assert/strict";
import {
  normalizeWorkspaceCommandMessage,
  parseAnswerTextOrThrow,
  parseWorkspaceCommand,
} from "./workspace-commands.js";
import type { WorkspaceUserInputRecord } from "./workspace-store.js";

const pending: WorkspaceUserInputRecord = {
  workspaceSessionId: "ws_test",
  questions: [
    {
      header: "Count",
      id: "count_mode",
      question: "How should count work?",
      options: [
        { label: "Visible", description: "Visible only" },
        { label: "All", description: "All nodes" },
      ],
    },
    {
      header: "Placement",
      id: "placement",
      question: "Where should it show?",
      options: [
        { label: "Inline", description: "After name" },
        { label: "Column", description: "Separate column" },
      ],
    },
  ],
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

assert.equal(normalizeWorkspaceCommandMessage("@dev /plan fix this"), "/plan fix this");
assert.equal(parseWorkspaceCommand("/plan fix this").kind, "plan");
assert.equal(parseWorkspaceCommand("@dev /goal ship this").kind, "goal");

const parsedAnswer = parseWorkspaceCommand("1B，2A", pending);
assert.equal(parsedAnswer.kind, "answer");
assert.equal(parsedAnswer.answers?.[0]?.label, "All");
assert.equal(parsedAnswer.answers?.[1]?.label, "Inline");

const directAnswer = parseAnswerTextOrThrow(pending, "1b 2b");
assert.deepEqual(directAnswer, [
  { questionId: "count_mode", label: "All" },
  { questionId: "placement", label: "Column" },
]);

assert.throws(() => parseAnswerTextOrThrow(pending, "1B"), /Missing answers for question 2/);
assert.throws(() => parseAnswerTextOrThrow(pending, "1C 2A"), /Option C is invalid/);
