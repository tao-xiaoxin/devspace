# Architecture Decision Guide

Before recommending a change, establish the minimum evidence:

- current public API, command, or tool contract;
- data schema, migration behavior, and persistence ownership;
- relevant tests and failure behavior;
- deployment, operator, and authorization boundaries;
- compatibility expectations for existing clients and stored data.

Ask:

1. What concrete user or operator failure does the change solve?
2. Which module owns the behavior and lifecycle?
3. What happens during partial failure, restart, retry, or concurrent access?
4. Which callers, stored records, or deployment paths can break?
5. How is the change verified and rolled back?

Prefer a narrow adapter or migration over a new framework when an existing boundary already fits the requirement.