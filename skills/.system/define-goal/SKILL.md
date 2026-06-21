---
name: define-goal
description: Legacy compatibility guidance for older DevSpace goal-definition prompts. DevSpace now uses devspace-goal for the durable project-scoped /goal workflow.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: legacy-workflow
  updated: 2026-06-21
---

# Legacy Define Goal Compatibility

This Skill is retained for compatibility with earlier prompts that request `define-goal`. New DevSpace alias resolution maps `/goal` to `devspace-goal`.

## Required Goal Lifecycle

1. Inspect the current project `workflowDigest` and call `get_goal` before creating or changing a Goal.
2. Create a Goal only when the user explicitly needs a persistent, cross-session outcome. Routine coding requests do not need one.
3. When no active Goal exists, use `create_goal` with an objective, scope, acceptance criteria, verification, stop conditions, and concise current summary.
4. When a Goal already exists and matches the request, preserve it and update only the parts that changed.
5. When a Goal conflicts with the new request, ask the user whether to archive it, mark it completed, mark it blocked, or keep it unchanged. Never silently replace an active Goal.
6. Use `update_goal(expectedRevision=...)` for every change to an existing Goal. Reload with `get_goal` after a revision conflict.

## Goal Standard

A durable Goal must be verifiable rather than aspirational:

- `objective`: one user-visible outcome.
- `scope.in` / `scope.out`: what is included and excluded.
- `successCriteria`: conditions that prove success.
- `verification`: tests, review checks, or manual validation.
- `stopConditions`: reasons to pause, escalate, or abandon the approach.
- `currentSummary`: compact completed/current/blocked state for the next session.

Use statuses deliberately:

- `active`: work can continue.
- `blocked`: a specific decision, dependency, or permission is missing.
- `completed`: success criteria were satisfied and verified.
- `archived`: no longer current, while history remains available.

Do not invent token counts, clock time, activity seconds, or percentage progress. Store evidence and blockers instead.

For the active DevSpace contract, resolve `devspace-goal` and read its references.