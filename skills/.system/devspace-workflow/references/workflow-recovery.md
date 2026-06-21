# Workflow Recovery Sequence

1. Call `open_workspace` once for the project root or worktree.
2. Read the compact `workflowDigest` returned by DevSpace.
3. Load `get_goal` only when the task depends on its objective, success criteria, verification, stop conditions, status, or revision.
4. Load `get_plan` only when the task needs its steps, validation, risks, status, or revision.
5. Use `get_workflow_history` only to inspect a specific past decision. Use the cursor rather than requesting unbounded history.
6. When updating Plan or Goal, pass the revision that was read. On conflict, reload and merge.

Do not automatically create a Goal merely because a workflowDigest is empty. Do not treat the digest as enough detail to execute an old Plan without loading it.
