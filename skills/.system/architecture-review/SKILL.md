---
name: architecture-review
description: Perform evidence-driven architecture review for a DevSpace workspace without bypassing project instructions, tests, workflow state, or authorization boundaries.
license: MIT
metadata:
  version: 1.0.2
  author: DevSpace
  category: system-engineering
  updated: 2026-06-22
---

# Architecture Review

Use this Skill for decisions spanning modules, persistent state, compatibility, security boundaries, migrations, rollout risk, or operational recovery.

## Method

1. Read `AGENTS.md`, relevant entry points, schema, public interfaces, tests, configuration, and deployment paths before making claims.
2. Separate observed facts from assumptions and unresolved questions.
3. Prefer the smallest compatible change that preserves migration safety and authorization boundaries.
4. Evaluate ownership, lifecycle, concurrency, failure recovery, backwards compatibility, observability, rollout, and rollback.
5. When a durable implementation plan is needed, resolve `/plan` and persist a verified Plan.

## Output

State:

- constraints and evidence;
- recommended boundary and approach;
- rejected alternatives and why;
- migration, security, and rollback effects;
- tests that prove the decision.

Do not produce generic architecture slogans or introduce a subsystem without identifying its code boundary and operational cost.
