---
name: devspace-plan
description: Create, resume, and maintain a durable DevSpace implementation Plan for the current project. Use for /plan and for requests that need a read-only analysis before code changes.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: workflow
  updated: 2026-06-21
---

# DevSpace Plan Workflow

Use this Skill when the user explicitly asks for `/plan`, asks to plan before implementation, or needs a durable execution checklist shared across future DevSpace sessions.

## Required Tool Lifecycle

1. Call `get_plan` first. Reuse the existing Plan when it matches the task instead of silently replacing it.
2. Call `set_collaboration_mode` with `mode="plan"` when entering an intentional planning pass.
3. Read relevant `AGENTS.md`, docs, source files, tests, and configuration. Planning is read-only: do not edit files, run destructive commands, or claim implementation is complete.
4. Ask with `request_user_input` only when a real decision changes scope, architecture, compatibility, safety, or rollout. Do not ask questions whose answer can be established by inspection.
5. Produce one finite implementation Plan with clear boundaries, ordered actions, validation, and risks.
6. Persist the Plan with `update_plan`:
   - Use `expectedRevision=0` when no current Plan exists.
   - Otherwise use the revision returned by `get_plan`.
   - If DevSpace reports a revision conflict, call `get_plan` again and reconcile; never overwrite blindly.
7. Keep Plan Mode enabled until the user explicitly starts implementation or switches back to default mode.

Read [references/plan-state.md](references/plan-state.md) for Plan fields and transitions. Read [references/plan-conflicts.md](references/plan-conflicts.md) before resolving concurrent updates.

## Planning Standard

A Plan must be specific enough that another session can continue it without reconstructing the project context. Every step must be an observable action, not a vague goal.

Use statuses deliberately:

- `pending`: not started.
- `in_progress`: the one active step, if work has started.
- `blocked`: cannot proceed; add a concise `note` with the blocker and the decision needed.
- `completed`: verified done.
- `skipped`: intentionally not doing this step; add a reason in `note`.

Do not use fake percentages, token budgets, elapsed-time estimates, or dashboard-style reporting.

## Required Output Shape

```markdown
# Plan

## Goal
<one concise sentence>

## Existing state
<facts established from repository inspection>

## Scope
- In: ...
- Out: ...

## Action items
- [ ] <concrete action>

## Validation
- <test, build, manual verification, or rollback check>

## Risks / rollback
- <real risk and mitigation>
```

The human-readable response must match the persisted Plan. Keep it concise but do not omit validation or risks when they matter.
