# Workflow Recovery

1. Call `open_workspace` once for a project root or worktree.
2. Read `workflowDigest`.
3. Load `get_plan` only when the requested work needs Plan steps, risks, validation, or revision.
4. Load `get_goal` only when the requested work needs Goal scope, criteria, verification, status, metrics, or revision.
5. Use `get_workflow_history` only for a specific past decision; use its cursor rather than requesting unbounded history.
6. Before updating a Plan or Goal, use the revision that was read. On conflict, reload and merge.

Do not treat a digest as enough context to execute a historical Plan without reading it. Do not create a Goal merely because no Goal exists.