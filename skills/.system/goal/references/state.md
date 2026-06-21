# Goal State

A Goal is durable project-scoped state. It is shared across sessions for the same canonical project root and isolated from other projects and Git worktrees.

## Fields

- `objective`: concrete user-visible outcome.
- `scope.in` / `scope.out`: boundaries.
- `successCriteria`: observable completion requirements.
- `verification`: tests, builds, review steps, or manual checks.
- `stopConditions`: conditions that justify pausing, escalating, or stopping.
- `currentSummary`: compact completed/current/blocked record.
- `status`: `active`, `blocked`, `completed`, `archived`.
- `revision`: optimistic-concurrency version.
- `metrics`: exact token, duration, and Plan-progress data only where evidence exists.

`create_goal` refuses to create a competing active Goal. After a Goal becomes blocked, completed, or archived, a new active Goal can be created deliberately.