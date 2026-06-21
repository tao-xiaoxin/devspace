---
name: skill-authoring-lite
description: Legacy compatibility Skill-authoring guidance. Use skill-authoring for the active DevSpace core Skill.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: legacy-engineering
  updated: 2026-06-21
---

# Legacy Skill Authoring Compatibility

This Skill is retained for older callers. The current core authoring workflow is `skill-authoring`.

## Authoring Contract

A DevSpace Skill must describe a real task workflow rather than act as a one-line persona prompt. Its `SKILL.md` should state:

- when the Skill applies;
- what repository evidence to inspect;
- which DevSpace Tools to call and in what order;
- write, shell, and security boundaries;
- validation and recovery behavior;
- where detailed references live.

## Structure

```text
skills/.system/<skill-name>/
├── SKILL.md
└── references/
```

Use `references/` for state contracts, API constraints, examples, checklists, or conflict procedures. Do not hide executable behavior in prose; Skills never grant additional filesystem, shell, Git, network, or credential access.

## Routing and Sources

`/plan` and `/goal` are reserved DevSpace aliases and must not be overridden by project-local, installed, global, or vendored Skills. `resolve_skill` selects and activates a Skill. `search_skills` discovers optional Skills without injecting their entire contents into context.

Use `skill://` locators for Skill files and activated resources; do not expose server absolute paths as the public protocol.

## Validation

When adding or revising a Skill, update discovery and alias tests, test controlled resource access, ensure package contents include the Skill, and verify the Tool contracts described by the workflow.