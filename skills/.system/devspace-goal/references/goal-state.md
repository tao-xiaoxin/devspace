# Goal State Contract

A Goal is project-scoped shared workflow state. It is not a chat transcript. It can expose measured token, work-duration, and Plan-progress fields only when their exact evidence rules are satisfied.

## Fields

- `objective`: required concrete outcome.
- `scope.in` / `scope.out`: boundaries.
- `successCriteria`: observable outcome checks.
- `verification`: tests, builds, inspection, or manual checks.
- `stopConditions`: conditions for pause, escalation, or intentional stop.
- `currentSummary`: concise completed / current / blocked information.
- `status`: `active`, `blocked`, `completed`, `archived`.
- `revision`: optimistic concurrency version.
- `metrics.tokenUsage`: append-only provider-reported usage totals, deduplicated by provider request ID.
- `metrics.workDuration`: server-measured milliseconds accumulated only while the explicit Goal timer is running.
- `metrics.progress`: completed Plan step ratio only when the current Plan is explicitly linked to this Goal.

## Exact Metric Rules

Use `record_goal_token_usage` only with fields from an actual API or provider usage response. Do not derive token values from message text, bytes, model context limits, or elapsed time.

`start_goal_work` stores a server timestamp and `pause_goal_work` persists elapsed wall-clock milliseconds. A transition from `active` to `blocked`, `completed`, or `archived` pauses a running timer automatically. This measures an explicit timer interval, not unobservable human or model thinking time.

Link a Plan through `update_plan` by sending the Goal ID as `goalId`. The canonical percentage progress fields are `completedSteps/totalSteps` and `percentageNumerator/percentageDenominator`; `displayPercent` is a rounded human presentation.

## Lifecycle

- `create_goal` creates an `active` Goal only when no active Goal exists.
- `update_goal` changes the current Goal and requires `expectedRevision`.
- `archived` removes a Goal from current hot state and retains its events in history.
- A later `create_goal` can start a new active Goal after a previous Goal has become blocked, completed, or archived.

## Current summary pattern

```text
Completed:
- ...

Current:
- ...

Blocked:
- ...
```

Keep this summary short enough to be useful in `workflowDigest`; do not paste tool output or chat history into it.
