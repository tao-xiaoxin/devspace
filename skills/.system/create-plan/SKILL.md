---
name: create-plan
description: Legacy compatibility guidance for older DevSpace planning prompts. DevSpace now uses devspace-plan for the durable project-scoped /plan workflow.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: legacy-workflow
  updated: 2026-06-21
---

# Legacy Create Plan Compatibility

This Skill is retained for projects or older prompts that still name `create-plan`. New DevSpace workflow resolution does not route `/plan` here; it routes to `devspace-plan`.

## Required Migration Behavior

When this legacy Skill is intentionally selected, follow the same durable planning contract as `devspace-plan`:

1. Open or reuse the current workspace and inspect its `workflowDigest`.
2. Call `get_plan` before replacing or editing any existing Plan.
3. Stay read-only while collecting repository evidence: read project instructions, public interfaces, tests, configuration, and relevant source files.
4. Ask questions only when an unresolved decision materially changes scope, compatibility, safety, or implementation order.
5. Present a finite Plan with explicit scope, ordered steps, validation, and risks.
6. Persist it with `update_plan`. Use `expectedRevision=0` only when no Plan exists; otherwise use the revision from `get_plan`.
7. On a revision conflict, reload the Plan and merge deliberately instead of retrying stale data.

## State Expectations

A Plan is project-scoped shared state. It survives a new ChatGPT session for the same canonical directory. It is not a chat log, a token budget, or a progress dashboard.

A complete Plan uses these states:

- Plan: `draft`, `active`, `completed`, `archived`
- Steps: `pending`, `in_progress`, `blocked`, `completed`, `skipped`

Only one step may be `in_progress`. A blocked or skipped step must preserve the reason in its note.

## Output Contract

```markdown
# Plan

## Goal
<the user outcome>

## Existing state
<repository facts established by inspection>

## Scope
- In: ...
- Out: ...

## Action items
- [ ] <concrete module or behavior change>

## Validation
- <test, build, manual verification, or rollback check>

## Risks / rollback
- <failure mode and mitigation>
```

For the current DevSpace workflow contract, resolve `devspace-plan` and read its references.