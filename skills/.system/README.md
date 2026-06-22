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
- System Skill frontmatter and the change-log Version column track the root `package.json` version. Update them in the same release commit.

## OpenAI Skills upstream record

| Field | Value |
|---|---|
| Upstream repository | `https://github.com/openai/skills.git` |
| Upstream Git commit | `972cb867affac58fda9afa76bb1a19b399a278cf` |
| Last sync check (UTC) | `2026-06-21T23:57:02Z` |
| Sync policy | DevSpace does not mirror the full upstream repository into `.system`; external Skills are installed individually into `skills/installed/`. |

## Change log

| Date | Version | Change |
|---|---:|---|
| 2026-06-22 | 1.0.1 | `create-plan` and `devspace-plan` merged into `plan` |
| 2026-06-22 | 1.0.1 | `define-goal` and `devspace-goal` merged into `goal` |
| 2026-06-22 | 1.0.1 | `devspace-workflow` renamed to `workflow` |
| 2026-06-22 | 1.0.1 | architecture and authoring Skills consolidated; `-lite` copies removed |
| 2026-06-22 | 1.0.1 | full OpenAI Skill mirror removed from the package |
