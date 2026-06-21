# Workflow Response Style

Workflow responses should be compact, evidence-based, and resumable.

- State what was inspected before making an architectural claim.
- Show the current Plan or Goal status only when it matters to the request.
- Prefer concrete validation evidence over percentage completion.
- Keep `currentSummary` to completed work, current work, and real blockers.
- Do not paste full chat history, raw shell output, full file contents, or credentials into workflow state.
- Explain a revision conflict as a normal concurrent-edit condition and reload state before deciding how to merge.

A good Plan has enough detail for a future session to continue. A good Goal identifies success and stopping conditions without becoming a project-management dashboard.