# Vendored OpenAI Skills

DevSpace can include a reviewed local copy of the upstream `openai/skills` `skills/` directory at `skills/.system/openai/skills/`.

DevSpace never fetches this source while serving MCP requests. The core aliases stay independent:

```text
/plan -> devspace-plan
/goal -> devspace-goal
```

Vendored Skills are optional discovery material. They cannot silently replace either core alias.

## Manual synchronization

Clone or update `https://github.com/openai/skills.git` outside the DevSpace runtime, review the target commit and every changed Skill, then run the maintainer-only helper:

```bash
npm run vendor:openai-skills -- --source /absolute/path/to/openai-skills --check
npm run vendor:openai-skills -- --source /absolute/path/to/openai-skills --apply
```

The helper verifies that the reviewed clone has the official `openai/skills` origin, stages a local copy, swaps the vendor tree only after staging succeeds, and writes `skills/.system/openai/UPSTREAM.md` with the full commit SHA and sync date.

Before committing a vendor update, inspect the diff, preserve every upstream `LICENSE.txt`, and run:

```bash
npm run typecheck
npm run test
npm run build
npm pack --dry-run
```

Do not run the helper from DevSpace startup, an MCP Tool, a package-install hook, or a scheduled task. Upstream changes become active only after a maintainer reviews and commits them.
