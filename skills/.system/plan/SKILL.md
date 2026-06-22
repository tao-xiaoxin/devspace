---
name: plan
description: Create, resume, and maintain a durable DevSpace implementation Plan for the current project. Use for /plan and for requests that require read-only analysis before code changes.
license: MIT
metadata:
  version: 1.0.2
  author: DevSpace
  category: system-workflow
  updated: 2026-06-22
---

# DevSpace Plan

Use this Skill for `/plan`, explicit implementation planning, or a task that should be analyzed before files are modified.

## Required lifecycle

1. Call `get_plan` first. Reuse a matching current Plan instead of silently replacing it.
2. Set collaboration mode to `plan` for the planning pass.
3. Read project instructions, source, tests, configuration, public interfaces, and migration paths. Planning is read-only: do not edit project files or claim implementation is complete.
4. Ask with `request_user_input` only when an unresolved decision changes scope, compatibility, architecture, safety, or rollout.
5. Produce one finite Plan with scope, ordered actions, validation, and risks.
6. Persist it with `update_plan`:
   - use `expectedRevision=0` only when no current Plan exists;
   - otherwise use the revision returned by `get_plan`;
   - on a revision conflict, reload and merge instead of retrying stale content.

Read [references/state.md](references/state.md) for Plan state and [references/conflicts.md](references/conflicts.md) before resolving concurrent changes.

## Output contract

```markdown
# Plan

## Goal
<one concise user outcome>

## Existing state
<facts established from repository inspection>

## Scope
- In: ...
- Out: ...

## Action items
- [ ] <concrete module, behavior, or test change>

## Validation
- <test, build, manual verification, or rollback check>

## Risks / rollback
- <real failure mode and mitigation>
```

The user-facing Plan must match the persisted Plan. Do not include token budgets, guessed time estimates, or invented percentage progress.
