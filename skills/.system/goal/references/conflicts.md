# Goal Conflicts

A Goal conflicts when the requested objective, scope, or acceptance criteria would direct the project toward a different outcome than the active Goal.

## Required user choice

Show the current Goal and requested Goal briefly, then ask whether to:

1. archive the current Goal and create the requested Goal;
2. complete the current Goal after verification;
3. mark the current Goal blocked with a concrete reason; or
4. keep the current Goal and treat the request as ordinary work.

Do not create competing active Goals and do not silently replace one.

## Revision conflict

A revision conflict means another session changed the Goal after it was read. Call `get_goal`, preserve valid changes, and update once with the refreshed revision.