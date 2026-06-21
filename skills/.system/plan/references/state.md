# Plan State

A Plan is durable project-scoped state. It is shared by new DevSpace sessions opened on the same canonical project root and isolated from different projects and Git worktree roots.

## Fields

- `title`: concise work name.
- `summary`: current evidence and decision record.
- `scope.in` / `scope.out`: explicit boundaries.
- `steps`: ordered executable work.
- `validation`: proof required before completion.
- `risks`: real rollback, security, migration, or compatibility concerns.
- `status`: `draft`, `active`, `completed`, `archived`.
- `revision`: optimistic-concurrency version.

## Step states

- `pending`: not started.
- `in_progress`: the one active step.
- `blocked`: cannot proceed; include a short note explaining the decision or dependency needed.
- `completed`: verified done.
- `skipped`: intentionally not performed; include a reason in the note.

A full step list is sent on every `update_plan`. At most one step can be `in_progress`.

## Linking a Goal

Set `goalId` on the current Plan only when that Plan is the authoritative work breakdown for a Goal. Goal percentage progress is then derived from completed Plan steps; it is unavailable when no current Plan is linked.
