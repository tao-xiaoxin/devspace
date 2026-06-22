---
name: skill-authoring
description: Create or revise DevSpace Skills with clear workflows, stable system routing, controlled resource access, and test coverage.
license: MIT
metadata:
  version: 1.0.2
  author: DevSpace
  category: system-engineering
  updated: 2026-06-22
---

# Skill Authoring

Use this Skill to create or revise a Skill bundled with DevSpace or stored in a project.

## Requirements

- Every Skill has valid frontmatter with an accurate `name` and `description`.
- Instructions describe a concrete lifecycle: when the Skill applies, what evidence to inspect, which tools to use, safety boundaries, validation, and recovery behavior.
- Put detailed contracts and examples in `references/`; do not make `SKILL.md` a one-line persona prompt or an unbounded manual.
- A Skill never grants automatic execution of scripts, shell commands, Git, service operations, file writes, network access, or credentials.
- Use `resolve_skill` to activate a Skill before reading its `skill://` resources.

## Directory policy

```text
skills/.system/           DevSpace system Skills only
skills/local/             repository-maintained project Skills
skills/installed/         externally installed project Skills
```

System Skill names are reserved: `plan`, `goal`, `workflow`, `architecture-review`, and `skill-authoring`. `/plan` and `/goal` are fixed system aliases and cannot be overridden.

Read [references/structure-checklist.md](references/structure-checklist.md) before accepting a Skill change.
