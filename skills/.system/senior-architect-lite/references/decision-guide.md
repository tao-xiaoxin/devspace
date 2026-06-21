# Architecture Decision Guide

Use an architecture recommendation only after documenting the relevant constraints.

## Minimum evidence

- current public API or command contract;
- data schema and migration path;
- relevant tests and failure behavior;
- deployment and operator boundary;
- compatibility expectations for existing clients and stored data.

## Decision questions

1. What concrete user or operator failure does the change solve?
2. Which module owns the new state or policy?
3. What happens during partial failure, restart, retry, or concurrent access?
4. Which existing callers could break?
5. How can the change be verified and rolled back?

Prefer a narrow adapter or migration over a new framework when the existing architecture already has a suitable boundary.