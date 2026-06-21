---
name: create-plan
description: Create a concise, execution-ready implementation plan for a coding task. Use when the user asks for /plan or wants a read-only planning pass before making code changes.
license: MIT
metadata:
  version: 1.0.0
  author: DevSpace
  category: workflow
  updated: 2026-06-21
---

# Create Plan

## Purpose

Use this skill to turn a coding request into a concrete implementation plan without editing files or claiming the work is already done.

## Workflow

1. Read the most relevant code, tests, docs, and entrypoints first.
2. Stay read-only for the full planning pass.
3. Ask at most one or two questions, and only when a real blocker remains after inspection.
4. Make reasonable assumptions when the missing detail does not materially change the implementation.
5. Produce one practical plan with ordered, atomic actions.

## Output Requirements

- Keep the plan finite and implementation-oriented.
- Default to 6-10 action items.
- Include validation or test steps.
- Include risks, boundaries, or rollback notes when they matter.
- Do not output large code blocks.
- Do not write files, run mutations, or say the work is complete.

## Recommended Shape

```markdown
# Plan

Short summary of the goal and the path.

## Scope
- In:
- Out:

## Action items
- [ ] ...

## Validation
- ...

## Risks
- ...
```
