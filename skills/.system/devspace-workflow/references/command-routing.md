# Command Routing

The `/plan` and `/goal` strings are stable DevSpace aliases, not native host slash commands.

- `/plan` resolves only to `devspace-plan`.
- `/goal` resolves only to `devspace-goal`.
- Project-local, installed, global, and vendored OpenAI Skills cannot silently override either alias.
- `resolve_skill` returns the full selected `SKILL.md` in one explicit call and activates its resource directory.
- `search_skills` discovers optional Skills without loading their instructions.

`handle_workspace_command` remains a compatibility helper for raw `/plan`, `/goal`, and compact pending-input replies. New workflows should call `resolve_skill`, `get_plan` / `get_goal`, and state tools directly.
