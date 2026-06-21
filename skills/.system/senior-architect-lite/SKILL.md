---
name: senior-architect-lite
description: Evaluate architecture options, tradeoffs, and implementation direction for coding tasks inside DevSpace.
license: MIT
metadata:
  version: 1.0.0
  author: DevSpace
  category: engineering
  updated: 2026-06-20
---

# Senior Architect Lite

## What This Skill Does

Use this skill when the task needs architecture guidance, solution framing, design tradeoff analysis, or implementation direction before code changes.

## Before Starting

1. Read the relevant code, types, configs, and entrypoints first.
2. Ground recommendations in the current repository, not generic best practices.
3. Keep conclusions concise and decision-oriented.

## Workflow

1. Identify the current architecture and constraints.
2. Compare only the viable options.
3. Recommend one approach with clear reasoning.
4. Surface the main risks, compatibility concerns, and validation needs.
5. If the task is still ambiguous, use `request_user_input` for the missing product or tradeoff decision.

## Deliverable

Return:

- recommended approach
- why it fits this codebase
- key implementation implications
- tests or checks needed to validate it

## References

- [Decision Guide](references/decision-guide.md)
- [Response Style](references/style.md)
