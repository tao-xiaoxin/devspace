---
name: skill-authoring
description: Create or revise DevSpace Skills with stable aliases, controlled resource access, test coverage, and no hidden execution behavior.
license: MIT
metadata:
  version: 2.0.0
  author: DevSpace
  category: engineering
  updated: 2026-06-21
---

# DevSpace Skill Authoring

Use this Skill when creating or revising a Skill bundled with DevSpace or installed in a workspace.

## Requirements

- Every Skill must have valid frontmatter with `name` and `description`.
- Instructions must describe a real workflow, tool lifecycle, safety boundary, validation standard, and recovery path where relevant.
- Put supporting detail in `references/`; do not make `SKILL.md` a one-line prompt or an unbounded manual.
- Skills must never imply automatic execution of scripts, shell commands, Git operations, or file writes.
- A Skill can only expose its resources after `resolve_skill` or a direct read of its `SKILL.md` activates it.
- `/plan` and `/goal` are reserved DevSpace aliases. Do not create a local Skill that expects to override them.

## Bundled Skill Layout

```text
skills/.system/<skill-name>/
├── SKILL.md
└── references/
```

DevSpace core Skills live directly under `skills/.system/`. Vendored OpenAI Skills live under `skills/.system/openai/skills/` and must remain unmodified except during a documented upstream sync.

## Validation

When changing Skills, add or update tests for discovery, source priority, alias routing, `skill://` access, packaging, and any tool contract the Skill depends on.
