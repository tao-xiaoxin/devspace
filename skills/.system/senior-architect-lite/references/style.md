# Architecture Review Style

Use direct language. Separate facts from assumptions. Name the exact file, interface, table, or external contract that supports an important claim.

Do not:

- propose a subsystem without showing its ownership and lifecycle;
- treat a generalized future need as evidence for present complexity;
- call an unverified behavior safe, compatible, or complete;
- hide migration, security, or rollback implications behind broad wording.

End with validation that a maintainer can actually run or observe.