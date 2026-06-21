---
name: define-goal
description: Rewrite a vague request into a concrete, verifiable goal with scope and acceptance criteria. Use when the user asks for /goal or needs a measurable target before execution.
license: MIT
metadata:
  version: 1.0.0
  author: DevSpace
  category: workflow
  updated: 2026-06-21
---

# Define Goal

## Purpose

Use this skill to convert an ambiguous request into a specific goal that can be verified in the current workspace.

## Workflow

1. Identify what should be true when the work is done.
2. Limit the scope to the systems, modules, or behaviors that actually matter.
3. Define how success will be verified with concrete evidence, thresholds, or commands when possible.
4. State what is explicitly out of scope.
5. If a critical scope or verification detail is missing, ask one short question. Otherwise, make a reasonable assumption and continue.

## Output Requirements

- Keep the goal measurable and bounded.
- Prefer real verification evidence over vague quality language.
- Do not invent long-running lifecycle mechanics, dashboards, or progress logs.
- Do not simulate native Codex goal commands.

## Recommended Shape

```markdown
# Goal

## Objective
...

## Scope
- In:
- Out:

## Success criteria
- ...

## Verification
- ...

## Stop / escalation conditions
- ...
```
