---
name: workflow
description: Recover and coordinate DevSpace project workflow state across sessions, including Plan, Goal, mode, routing, and concise history.
license: MIT
metadata:
  version: 1.0.1
  author: DevSpace
  category: system-workflow
  updated: 2026-06-22
---

# DevSpace Workflow

Use this Skill when a request depends on cross-session recovery, Plan Mode, workspace isolation, workflow history, or Skill routing.

## Resume sequence

After `open_workspace`, inspect `workflowDigest` first.

- No active state: work normally; create a Plan or Goal only when the task calls for durable state.
- Existing Plan or Goal: call `get_plan` or `get_goal` only when the full definition matters.
- Relevant earlier decision: call paginated `get_workflow_history`; do not load history by default.
- A matching request can resume state. An incompatible Goal follows the Goal conflict procedure.

## Isolation

- Same canonical project root: shared across sessions and DevSpace restarts.
- Different project root: isolated.
- Different Git worktree root: isolated by default.
- `workspaceId` is only a session handle, never durable Plan or Goal identity.

## Modes

`plan` is a workflow preference, not a security boundary.

- `plan`: inspect, ask material questions, write or revise the Plan, then wait for implementation approval.
- `default`: perform approved changes, test them, and maintain relevant state.

Plan Mode does not grant filesystem, shell, Git, network, credential, or service-management permission.

Read [references/routing.md](references/routing.md), [references/recovery.md](references/recovery.md), and [references/mode.md](references/mode.md) for details.