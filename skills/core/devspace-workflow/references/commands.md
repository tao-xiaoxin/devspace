# Command Mapping

## `/plan`

Inputs:

- `@dev /plan ...`
- `/plan ...`

Expected behavior:

1. Call `handle_workspace_command`.
2. Ensure the workspace moves to `plan` mode.
3. Continue with planning tools and repository exploration.
4. Keep replies short unless the user explicitly asks for detail.

## `/goal`

Inputs:

- `@dev /goal ...`
- `/goal ...`

Expected behavior:

1. Call `handle_workspace_command`.
2. Create or continue the workspace goal.
3. Use `get_goal` and `update_goal` for lifecycle management.

## Compact Answers

Inputs:

- `1B，2A`
- `1B, 2A`
- `1b 2a`

Expected behavior:

1. Check that a pending `request_user_input` exists.
2. Pass the raw text to `handle_workspace_command` or `answer_user_input(text)`.
3. Do not rewrite the user's answer into prose before submitting it.

## Failure Handling

- If there is no open workspace, open one first.
- If there is no pending user input, do not pretend the answer was accepted.
- If the compact answer is incomplete or invalid, return the specific validation error.
