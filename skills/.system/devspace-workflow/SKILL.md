---
name: devspace-workflow
description: Recover and coordinate project-scoped DevSpace workflow state across sessions, including Plan, Goal, mode, and concise history.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: workflow
  updated: 2026-06-21
---

# DevSpace Workflow Recovery

DevSpace stores a small project-scoped workflow state keyed by the workspace's canonical real path. This lets a new ChatGPT session continue the current project without loading chat transcripts, tool output, or all historical Plans.

## Start or Resume

After `open_workspace`, inspect `workflowDigest` first.

- No active state: work normally. Create a Plan or Goal only when the user asks for durable workflow state.
- Existing Goal or Plan: call `get_goal` or `get_plan` only when the current task needs its complete definition.
- Relevant older decision: call `get_workflow_history` with a small page size. Do not load history by default.
- A matching user request can resume the current workflow; an incompatible request requires the Goal conflict procedure.

## Scope and Isolation

- Same canonical project root: shared across DevSpace sessions and restarts.
- Different project roots: isolated.
- Different Git worktree roots: isolated by default.
- `workspaceId` is a session handle, never the durable Plan or Goal identity.

## Mode

`plan` is a workflow preference, not a permission boundary.

- `plan`: read, inspect, ask material questions, write or update the Plan, then wait for implementation approval.
- `default`: make approved changes, test, and maintain the Plan or Goal when relevant.

Plan Mode never grants extra filesystem, shell, Git, or Skill permissions.

## History

Workflow history contains only compact events such as `plan.updated`, `goal.blocked`, and `mode.changed`. It must never contain full chats, raw tool output, secrets, or command logs.

Read [references/workflow-recovery.md](references/workflow-recovery.md) for the resume sequence and [references/command-routing.md](references/command-routing.md) for alias behavior.
