---
name: senior-architect
description: Perform evidence-driven architecture review for a DevSpace workspace without bypassing project instructions, tests, or workflow state.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: engineering
  updated: 2026-06-21
---

# Senior Architect Review

Use this Skill for design decisions that span modules, persistent state, compatibility, security boundaries, or rollout risk.

## Method

1. Read `AGENTS.md`, entry points, data schema, public API, tests, and relevant configuration before making design claims.
2. Distinguish observed facts from assumptions and unresolved questions.
3. Prefer the smallest compatible change that preserves security boundaries and migration safety.
4. Evaluate data ownership, lifecycle, failure recovery, concurrency, backwards compatibility, observability, and release validation.
5. When the user is asking for a Plan, follow `devspace-plan` and persist only a verified, implementation-ready Plan.

## Output

Give a decision with:

- current constraints and evidence,
- recommended approach,
- rejected alternatives and why,
- migration and rollback impact,
- tests that prove the decision.

Do not produce generic architecture slogans. Do not propose a new subsystem without identifying the concrete code boundaries and operational cost.
