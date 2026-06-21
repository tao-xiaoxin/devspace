# Skill Structure Checklist

Before accepting a Skill change, verify:

- frontmatter has a stable name and an accurate description;
- the Skill says when it applies and when it does not;
- required Tool calls and their order are explicit;
- file, shell, Git, network, and credential boundaries are explicit;
- supporting procedures live in `references/` rather than bloating the main Skill;
- reserved aliases such as `/plan` and `/goal` are not overridden;
- the Skill can recover from missing state or a revision conflict;
- discovery, resolution, resource access, and packaging tests cover the change.

A Skill must guide a dependable workflow, not merely request a tone or role.