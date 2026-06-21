# Plan Revision Conflicts

Multiple sessions can open the same project. DevSpace uses the Plan `revision` to prevent one session from silently erasing another session's work.

## Resolution procedure

1. A Plan update returns a revision conflict.
2. Stop; do not resend the stale Plan payload.
3. Call `get_plan` again.
4. Compare changed steps, notes, validation, risks, and status.
5. Preserve completed work and real blockers from the current Plan.
6. Submit one merged complete Plan with the refreshed `expectedRevision`.

Do not use a conflict to justify overwriting a Plan just because a previous model response was longer or newer in chat history.