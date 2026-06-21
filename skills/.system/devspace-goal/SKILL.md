---
name: devspace-goal
description: Define and maintain a durable, verifiable project Goal in DevSpace. Use for /goal when the user explicitly wants a goal to persist across sessions.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: workflow
  updated: 2026-06-21
---

# DevSpace Goal Workflow

Use this Skill when the user asks for `/goal`, asks to preserve a project outcome across sessions, or needs explicit success and stop conditions. Do not create a Goal for every routine coding request.

## Required Tool Lifecycle

1. Call `get_goal` before creating or changing a Goal.
2. If no current Goal exists, clarify only material ambiguity and call `create_goal`.
3. If the current Goal matches, continue it and use `update_goal` only when the definition, summary, verification, or status changes.
4. If the current Goal conflicts with the new request, show the conflict and ask the user to choose one action:
   - replace the old Goal by archiving it,
   - mark the old Goal `completed`,
   - mark the old Goal `blocked`, or
   - keep the old Goal unchanged.
5. Before updating, use the Goal revision from `get_goal` as `expectedRevision`.
6. On a revision conflict, reload with `get_goal` and merge deliberately. Never overwrite a different session's Goal state blindly.
7. When execution starts, call `start_goal_work`; pause it with `pause_goal_work` before waiting for approval, changing tasks, or ending work. This is the only source of Goal work-duration data.
8. Record tokens only with `record_goal_token_usage` when an upstream provider/API has returned exact counts and a stable request ID. Never infer tokens from text length, elapsed time, or model name.
9. For exact percentage progress, link the current Plan to the Goal through `update_plan(goalId=...)`. Goal progress is then derived from completed Plan steps, not guessed.

Read [references/goal-state.md](references/goal-state.md) for field definitions and [references/goal-conflicts.md](references/goal-conflicts.md) for conflict handling.

## Goal Quality Standard

A Goal must describe a user-visible outcome that can be verified. It is not a task dump and it is not a time or token budget.

Include:

- `objective`: a one-sentence intended outcome.
- `scope.in` and `scope.out`: boundaries.
- `successCriteria`: what must be true when done.
- `verification`: commands, tests, review steps, or manual checks.
- `stopConditions`: conditions that justify stopping or escalating.
- `currentSummary`: compact state of completed work, current work, and blockers.

## Status Rules

- `active`: the current target is being pursued.
- `blocked`: progress needs an external decision, dependency, or access change.
- `completed`: the defined criteria were met and verified.
- `archived`: intentionally removed from current workflow state; history remains available.

The Goal has three measurable fields only under explicit evidence rules:

- Provider tokens: append-only counts returned by a provider/API response, deduplicated by provider request ID.
- Work duration: server wall-clock milliseconds while `start_goal_work` is running; it is paused explicitly and automatically when a Goal leaves `active`.
- Percentage progress: exact completed-step ratio from the current Plan only when that Plan is explicitly linked to this Goal. The stored numerator/denominator is canonical; display percentages are rounded for humans.

Never invent or backfill any of these values from chat text, elapsed conversation time, or intuition.
