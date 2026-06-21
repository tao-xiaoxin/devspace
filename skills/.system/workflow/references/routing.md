# Workflow Routing

`/plan` and `/goal` are DevSpace routing aliases, not native ChatGPT slash commands.

```text
/plan -> skills/.system/plan
/goal -> skills/.system/goal
```

The aliases are fixed system routes. Local, installed, and global Skills cannot override them.

Use `resolve_skill` to load a selected Skill. Use `search_skills` to discover optional project-local, installed, or global Skills without loading every instruction into context.

Skill resources are accessed through `skill://` locators only after a Skill has been resolved. Do not expose server absolute paths in model-facing output.