# DevSpace Workflow Commands

DevSpace command strings are routing conventions used by the model, not shell commands and not native ChatGPT slash commands.

## `/plan`

1. Resolve `devspace-plan` through `resolve_skill("/plan")`.
2. Read the current Plan with `get_plan`.
3. Set collaboration mode to `plan` when entering a planning pass.
4. Inspect the repository read-only, ask material questions only, and persist the complete Plan with `update_plan(expectedRevision=...)`.
5. Do not write project files while Plan Mode remains active.

## `/goal`

1. Resolve `devspace-goal` through `resolve_skill("/goal")`.
2. Read the current Goal with `get_goal`.
3. Create one only when the user asks for a durable, cross-session objective.
4. For a conflicting active Goal, ask before archiving, completing, blocking, or keeping it.
5. Use `expectedRevision` on every existing Goal update.

## Optional Skills

Use `search_skills` to discover Skills without injecting all instructions into context. Once selected, call `resolve_skill` with the returned qualified ID. A Skill reference can be read only after the Skill has been resolved and activated.