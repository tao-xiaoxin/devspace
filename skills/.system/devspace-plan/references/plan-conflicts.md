# Plan Revision Conflicts

Multiple ChatGPT sessions can open the same project. DevSpace prevents silent loss by versioning the current Plan.

## Conflict procedure

1. A Plan update returns a revision conflict.
2. Stop; do not retry the old payload.
3. Call `get_plan` and inspect the current revision, changed steps, notes, and summary.
4. Merge only compatible changes.
5. Call `update_plan` with the refreshed `expectedRevision`.

## Do not

- Do not assume your in-memory Plan is current.
- Do not overwrite a blocker, validation result, or completed step without checking why it changed.
- Do not turn a revision conflict into a user-facing implementation failure when it can be resolved by reloading state.
