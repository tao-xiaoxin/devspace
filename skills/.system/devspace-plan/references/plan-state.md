# Plan State Contract

A DevSpace Plan is project-scoped state. It survives a new `open_workspace` call for the same canonical project directory and is isolated from other projects and Git worktrees.

## Plan fields

- `title`: concise name for the work.
- `summary`: current implementation context and decision record.
- `scope.in` / `scope.out`: explicit boundaries.
- `steps`: ordered executable work.
- `validation`: evidence required before completion.
- `risks`: operational, compatibility, or rollback concerns.
- `status`: `draft`, `active`, `completed`, or `archived`.
- `revision`: optimistic-concurrency version.

## Update rules

- Call `get_plan` before modifying a Plan.
- Pass `expectedRevision=0` only to create a Plan when none exists.
- Pass the current `revision` for every update to an existing Plan.
- `archived` removes the Plan from the current hot state but retains its event history.
- `completed` remains readable as the current Plan until a new Plan is explicitly created after archiving it.

## Step rules

Keep the step list complete on every `update_plan` call. At most one step can be `in_progress`. A `blocked` or `skipped` step needs a short `note` that makes the future decision clear.
