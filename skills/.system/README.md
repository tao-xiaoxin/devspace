# DevSpace System Skills

This directory contains DevSpace-owned system Skills only.

## Entries

| Directory | Skill | Purpose |
|---|---|---|
| `plan/` | `plan` | `/plan`, durable Plans, steps, validation, and conflicts |
| `goal/` | `goal` | `/goal`, Goal lifecycle, metrics, and conflicts |
| `workflow/` | `workflow` | recovery, modes, isolation, routing, and history |
| `architecture-review/` | `architecture-review` | evidence-based architecture review |
| `skill-authoring/` | `skill-authoring` | Skill structure and quality rules |

## Policy

- `/plan` always resolves to `plan`.
- `/goal` always resolves to `goal`.
- The five Skill names above are reserved system names.
- Project-local, installed, and global Skills cannot override reserved names or aliases.
- External Skills belong in `skills/installed/`, not in `.system`.
- Old system Skill identifiers are not supported; use the names listed in the table above.

## Change log

| Date | Version | Change |
|---|---:|---|
| 2026-06-22 | 3.0 | `create-plan` and `devspace-plan` merged into `plan` |
| 2026-06-22 | 3.0 | `define-goal` and `devspace-goal` merged into `goal` |
| 2026-06-22 | 3.0 | `devspace-workflow` renamed to `workflow` |
| 2026-06-22 | 3.0 | architecture and authoring Skills consolidated; `-lite` copies removed |
| 2026-06-22 | 3.0 | full OpenAI Skill mirror removed from the package |
