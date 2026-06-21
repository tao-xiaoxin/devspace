# Collaboration Mode

## Plan mode

Plan Mode is for repository inspection, material clarification, and durable Plan updates. `update_plan` is allowed. Project source edits, shell mutations, Git mutations, and implementation claims should wait for user approval or a return to default mode.

## Default mode

Default mode permits approved work through the existing DevSpace authorization boundaries. Keep a relevant Plan or Goal accurate when work changes its steps, verification evidence, blocker, or status.

## History

Workflow events are concise structured records such as `plan.updated`, `goal.blocked`, and `mode.changed`. They are not chat history and must not contain raw tool output, full diffs, logs, credentials, or source snapshots.