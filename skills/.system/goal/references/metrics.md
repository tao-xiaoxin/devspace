# Exact Goal Metrics

Goal metrics are recorded only under explicit evidence rules.

## Provider tokens

Use `record_goal_token_usage` only with exact counts returned by a model provider or API and a stable provider request ID. Usage is append-only and deduplicated by `provider + providerRequestId`.

Never estimate tokens from text length, message bytes, context limits, model names, elapsed time, or intuition.

## Work duration

Call `start_goal_work` when measured work begins. Call `pause_goal_work` before waiting for approval, changing tasks, or stopping. DevSpace persists exact server wall-clock milliseconds only while this timer is running. A Goal transition out of `active` pauses a running timer automatically.

This is an explicit timer interval, not a claim about hidden model reasoning or user attention.

## Percentage progress

Set the current Plan `goalId` to this Goal ID only when that Plan is the authoritative work breakdown. Progress then uses completed Plan steps:

- canonical fraction: `completedSteps/totalSteps`;
- exact rational percentage: `percentageNumerator/percentageDenominator`;
- `displayPercent`: rounded human display only.

Without a linked current Plan, percentage progress is unavailable rather than guessed.