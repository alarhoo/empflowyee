# HCM access-control application

Owns the access-control application boundary for the approved local stage.
Application ports contain no SQL or HTTP types. Infrastructure binds authorization
and audit to the caller's verified PostgreSQL transaction; it never migrates or
seeds on startup.

See [shared contracts](../../../../../docs/hcm/tdd/TDD-HCM-1-LOCAL-COMMON.md)
and the [delivery order](../../../../../docs/hcm/roadmap/HCM-1-LOCAL-DELIVERY.md).
Run `pnpm hcm:db:test` from the repository root for disposable PostgreSQL tests.
These libraries alone expose no new business endpoint or launchpad app.
