# Workflow State Examples

## Resume an existing Plan

`open_workspace` reports an active Plan in `workflowDigest`.

1. Call `get_plan`.
2. Confirm the requested work still matches the Plan scope.
3. When implementation starts, set the relevant pending step to `in_progress` using the returned revision.
4. After validation, mark the step `completed` and record a concise note only when the result matters to the next session.

## Handle a concurrent update

A Plan update fails with a revision conflict.

1. Call `get_plan` again.
2. Compare the new step statuses, validation, and blockers against the intended update.
3. Preserve verified work from the other session.
4. Send one merged full step list with the new revision.

## Recover a blocked Goal

A Goal has `status=blocked` after an external decision is needed.

1. Do not update the non-active Goal in place.
2. Resolve the blocker with the user.
3. Create a new Goal that captures the resumed outcome, or keep the blocked Goal as historical context.
4. Link the new Plan to the new Goal when the relationship is useful.
