---
name: goal
description: Define and maintain a durable, verifiable project Goal in DevSpace. Use for /goal when the user explicitly wants an outcome to persist across sessions.
license: MIT
metadata:
  version: 3.0.0
  author: DevSpace
  category: system-workflow
  updated: 2026-06-22
---

# DevSpace Goal

Use this Skill for `/goal` or when the user explicitly requests a durable cross-session objective. Do not create a Goal for every ordinary coding request.

## Required lifecycle

1. Call `get_goal` first.
2. With no active Goal, create one with a concrete objective, scope, success criteria, verification, stop conditions, and concise current summary.
3. With a matching active Goal, continue it and update only fields that changed.
4. With a conflicting active Goal, ask the user whether to archive it, complete it, block it, or keep it. Never silently replace an active Goal.
5. Use the revision returned by `get_goal` as `expectedRevision` on every update. Reload before merging a revision conflict.
6. Start and pause measured work with `start_goal_work` and `pause_goal_work`.
7. Record tokens only with `record_goal_token_usage` when an upstream API or provider returned exact usage plus a stable request ID.
8. Link the current Plan through `update_plan(goalId=...)` only when the Plan is the authoritative breakdown for Goal progress.

Read [references/state.md](references/state.md), [references/metrics.md](references/metrics.md), and [references/conflicts.md](references/conflicts.md) before acting on Goal state.

## Status

- `active`: the outcome can proceed.
- `blocked`: a specific decision, dependency, or permission is missing.
- `completed`: success criteria have been verified.
- `archived`: no longer current; history remains available.

`currentSummary` contains only completed work, current work, and real blockers. Never put chat transcripts, raw tool output, file snapshots, or secrets into Goal state.
