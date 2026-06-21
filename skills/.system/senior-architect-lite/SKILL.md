---
name: senior-architect-lite
description: Legacy compatibility architecture-review workflow. Use senior-architect for the active DevSpace core Skill.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: legacy-engineering
  updated: 2026-06-21
---

# Legacy Architecture Review Compatibility

This Skill remains for compatibility with older prompts. The active core Skill is `senior-architect`.

## Evidence First

Before recommending an architectural change, inspect the project instructions, public interfaces, schema and persistence model, tests, deployment configuration, and current failure paths. Separate observed facts from assumptions.

## Required Review Dimensions

Evaluate each relevant dimension explicitly:

- ownership and lifecycle of state;
- API and storage compatibility;
- concurrency, retries, and data-loss failure modes;
- authorization, filesystem, shell, and network boundaries;
- migration and rollback;
- observability and operator recovery;
- tests that prove the proposed behavior.

Do not propose a subsystem because it sounds broadly useful. Tie every recommendation to concrete files, interfaces, user flows, and operational cost.

## Workflow State

When reviewing Plan or Goal work, remember that DevSpace state is scoped to a canonical project root. It is shared across new sessions for the same root but isolated from other projects and Git worktrees. Plans and Goals use revisions to prevent silent concurrent overwrite.

## Output

Return:

1. constraints and evidence;
2. a recommended implementation boundary;
3. alternatives rejected and why;
4. migration, rollback, and security effects;
5. validation steps.

Use `devspace-plan` when the user wants a persisted implementation Plan.