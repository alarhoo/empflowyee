# HCM0-02 database foundation validation

Locally verified on 2026-09-23 with Node 24.21.0, pnpm 12.5.1 and PostgreSQL
17.11 (official Alpine image, digest pinned in the disposable harness).
This evidence covers local infrastructure; it does not claim Cloud SQL deployment,
production authentication, domain schemas or seeded business data.

## Automated evidence

`pnpm hcm:db:test` runs 21 tests: 11 database integration scenarios and 10 existing
runtime/contract regressions. Database assertions use the production runner,
query adapter and administrator provisioning script against real PostgreSQL.

- Concurrent runners serialize; exactly one applies the first migration.
- Reruns are no-ops; only foundation history exists after the production SQL inventory.
- Runtime cannot read migration history or impersonate the migrator.
- Checksums detect historical changes; CRLF checkouts remain equivalent; gaps,
  missing applied history and malformed UTF-8 are rejected.
- Failed SQL and attempted COMMIT roll back DDL and history; a corrected unapplied
  draft can retry, and later migrations apply in order.
- The explicit Node CLI works; merely constructing a runtime pool opens no connection.
- Missing, copied, expired and mismatched tenant/session contexts fail closed.
- RLS blocks cross-tenant SELECT, INSERT, UPDATE, DELETE and ownership reassignment.
  Missing SQL tenant context returns no rows and rejects insertion.
- A single physical pooled connection clears tenant settings after commit and
  rollback; concurrent tenant calls remain isolated and rollback restores data.
- Session expiry is rechecked after waiting for a pool connection.
- An administrator accidentally enabling BYPASSRLS causes runtime queries to fail closed.
- Elevated connection credentials are rejected; shutdown drains physical pool connections.

Business table probes and SQL repair fixtures exist only in tests. Test teardown
closes clients, deletes its allocated temporary SQL inventory and removes its
uniquely named disposable container.

## Repository checks

```sh
pnpm hcm:db:test
pnpm exec nx run-many -t lint,typecheck --projects=hcm-api-database-migrations,hcm-api-database-kysely,hcm-api-runtime-application,hcm-api-runtime-transport,hcm-api --parallel=2
pnpm exec nx build hcm-api --configuration=production
pnpm architecture:check
pnpm docs:check
pnpm lint:tooling
```

Maintained changed files are checked with Prettier and `git diff --check`.
The unchanged public session DTO remains covered by real Nest HTTP regressions;
database libraries are API-only and the browser composition is unchanged.

Node's direct TypeScript migration CLI may emit `MODULE_TYPELESS_PACKAGE_JSON`
because the repository root supports mixed module tooling. Node reparses this
ES module correctly; the CLI succeeds without changing the monorepo module mode.

See [database operations](../engineering/DATABASE-OPERATIONS.md) for provisioning,
migration failure recovery and future domain adoption. HCM0-03 is the next
database milestone: versioned development seed tooling.
