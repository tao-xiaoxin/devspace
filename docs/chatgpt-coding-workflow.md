# ChatGPT Coding Workflow

DevSpace brings a Codex-style coding-agent loop to ChatGPT and other MCP hosts:
inspect the repo, follow local instructions, make scoped edits, run
verification, and show the user what changed.

## Open One Workspace

ChatGPT should call `open_workspace` once for a project folder:

```json
{
  "path": "~/work/my-project"
}
```

The result includes a `workspaceId` and a compact `workflowDigest`. All later file, search, edit, show-changes, shell, Skill, Plan, and Goal calls should reuse that same `workspaceId`.

Do not reopen the same folder unless:

- the `workspaceId` is rejected as unknown
- the user switches to another folder
- the user switches between checkout and worktree mode
- the user explicitly asks to reopen

## Checkout Mode

Checkout mode is the default. DevSpace opens the actual directory:

```json
{
  "path": "~/work/my-project"
}
```

Use this when the user wants ChatGPT to work in the current checkout.

## Worktree Mode

Use worktree mode for isolated parallel work:

```json
{
  "path": "~/work/my-project",
  "mode": "worktree"
}
```

Managed worktrees are created under:

```text
~/.devspace/worktrees
```

Worktree mode requires a Git repository with at least one commit. It starts from
`HEAD` unless `baseRef` is provided.

Uncommitted source checkout changes are not copied into the managed worktree.
DevSpace reports when the source checkout was dirty so the model can decide how
to proceed with the user.

## Project Instructions

When a workspace opens, DevSpace loads root-level instruction files:

- `AGENTS.md`
- `AGENTS.MD`
- `CLAUDE.md`
- `CLAUDE.MD`

Nested instruction files are returned as `availableAgentsFiles`. The model
should read the relevant nested file before working under that directory.

This keeps instructions explicit and inspectable instead of silently injecting
new context during later tool calls.

## Skills

Skills are enabled by default for coding-agent workflows.

DevSpace discovers Skills from:

- five DevSpace system Skills in `skills/.system`: `plan`, `goal`, `workflow`, `architecture-review`, and `skill-authoring`
- workspace-local Skills in `skills/local`
- workspace-installed Skills in `skills/installed`
- `DEVSPACE_AGENT_DIR`, which defaults to `~/.codex`
- optional paths from `DEVSPACE_SKILL_PATHS`

ChatGPT Plus on the web cannot natively install or register Codex Skills. In this setup, DevSpace provides MCP-based skill installation, discovery, and resolution.

`@devspace /plan` and `@devspace /goal` are workflow aliases, not native ChatGPT slash commands. `/plan` always resolves to system `plan`; `/goal` always resolves to system `goal`. Project-local, installed, and global Skills cannot silently override either alias.

User-installed project skills can be managed through DevSpace itself:

```text
请使用 DevSpace 打开当前项目，然后调用 install_skill，把 GitHub 仓库 openai/skills 里的 skills/.curated/research 安装到当前 workspace。
```

```text
请注意 install_skill 只接受标准 skill 包目录。像仓库根目录、plugin 目录、commands 目录或 agent rules 目录都不应该安装，只有直接包含 SKILL.md 的 skill 目录才可以。
```

```text
请调用 list_installed_skills，列出当前 workspace 的 installed skills。
```

```text
请调用 remove_skill，删除当前 workspace 里名为 research 的 installed skill。
```

```text
@devspace /plan 为跨平台服务管理增加 restart、status 和 logs 支持
```

```text
@devspace /goal 将 DevSpace 的第三方 Skill 安装流程收敛为可测试、可回滚、跨平台兼容的实现
```

`open_workspace` returns system and project Skill metadata only, capped at 24 entries, plus a source-count summary. Use `resolve_skill` to load the full `SKILL.md` once a Skill is selected. Use `search_skills` to discover additional local, installed, or global Skills without loading every Skill instruction into context.

Skill resources use `skill://` locators. DevSpace only permits reading:

- a resolved `SKILL.md`
- files under an activated Skill directory

Set `DEVSPACE_SKILLS=0` to hide skills from workspace output.

DevSpace system Skills define the stable `/plan`, `/goal`, workflow recovery, and MCP Tool contracts. External Skills are installed only when needed and never control the core aliases.

## Project Workflow Store

DevSpace keeps only a small project-scoped workflow state. It is shared by every DevSpace session opened on the same canonical directory, while different project roots and different Git worktree roots stay isolated.

`open_workspace` returns only `workflowDigest`, not Plan history, Goal history, chat transcripts, tool output, or shell logs. Load full state on demand:

- `get_plan`: current Plan, step states, validation, risks, and revision
- `get_goal`: current Goal, criteria, verification, stop conditions, summary, and revision
- `get_workflow_history`: concise paginated status events; default 20, maximum 50

Create a Plan with `update_plan(expectedRevision=0, ...)`. For an existing Plan or Goal, first call `get_plan` or `get_goal`, then pass the returned `expectedRevision`. A conflict means another session updated state first; reload and merge rather than overwriting it.

`plan` mode is a planning preference, not a permission boundary. It permits `update_plan` but should not perform project file changes until the user approves execution.

## Tool Names

Short names are the default:

- `open_workspace`
- `read`
- `write`
- `edit`
- `bash`

By default, DevSpace also runs in `DEVSPACE_TOOL_MODE=minimal`, so dedicated
`grep`, `glob`, and `ls` tools are hidden. Use `bash` with command-line tools
such as `rg`, `find`, and `ls` for search and directory inspection.

Legacy names are available with `DEVSPACE_TOOL_NAMING=legacy`:

- `open_workspace`
- `read_file`
- `write_file`
- `edit_file`
- `run_shell`

Use `DEVSPACE_TOOL_MODE=full` to restore dedicated search and directory tools.

## Show Changes

By default, `DEVSPACE_WIDGETS=full`.

In that mode, DevSpace attaches widget UI to the exposed workspace, file, edit,
and shell tools. The aggregate `show_changes` tool is not exposed by default.

Use `DEVSPACE_WIDGETS=off` to disable widget UI, or `DEVSPACE_WIDGETS=changes`
to expose the aggregate show-changes flow.

## Shell Use

The shell tool is for commands that belong in a terminal:

- tests
- builds
- git inspection
- package scripts
- environment checks

File writes should go through the edit/write tools rather than shell
redirection, heredocs, `tee`, `sed -i`, or generated scripts.
