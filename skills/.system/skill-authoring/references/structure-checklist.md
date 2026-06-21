# Skill Structure Checklist

Before accepting a Skill change, verify:

- frontmatter has a stable name and accurate description;
- the Skill says when it applies and when it does not;
- required tool calls and their order are explicit;
- file, shell, Git, network, and credential boundaries are explicit;
- supporting procedures live in `references/` rather than bloating the main Skill;
- reserved system names and `/plan` / `/goal` aliases are not overridden;
- the Skill has a recovery path for missing state or revision conflict when relevant;
- discovery, resolution, resource access, packaging, and any described tool contracts have test coverage.

A Skill must guide a dependable workflow, not merely ask the model to adopt a tone or role.