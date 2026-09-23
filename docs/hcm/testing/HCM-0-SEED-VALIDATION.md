# HCM0-03 seed framework validation

Verified locally on 2026-09-23 with the pinned Node 24.21.0/pnpm 12.5.1 toolchain
and real PostgreSQL 17.11 in the existing disposable Docker harness.

`pnpm hcm:db:test` passes 34 tests: 13 seed scenarios, 11 database/query scenarios
and 10 runtime/contract regressions. Seed coverage includes:

- Empty canonical manifest, explicit CLI execution and rejection of unconfirmed reset.
- Deterministic IDs, FK-enforced dependency ordering, repeat no-op and version upgrades.
- Missing/cyclic dependencies, unsafe paths, duplicate versions, unknown fields and invalid ID tokens.
- Immutable apply/reset checksums, CRLF normalization and deleted historical definitions.
- Missing migration prerequisites and modified canonical SQL history.
- Partial failure rollback and retry without changing SQL or replaying successful modules.
- Rejection of COMMIT inside seed SQL, preserving atomic history/data writes.
- Concurrent runners applying once and waiting for the migration runner's advisory lock.
- Reverse reset order, preservation of unmanaged records and identical IDs after reapply.
- Atomic rollback of all reset steps and history when a later reverse step fails.
- Rejection of unknown/production/cloud targets, URI overrides, wrong database/role and missing database marker.
- Runtime denial of protected seed ledger access.

Probe tables and data exist only in the disposable tests. Their FORCE RLS policy
explicitly permits the restricted migrator's fixture writes; the framework never
disables RLS or enables BYPASSRLS. The production inventory adds only
`hcm.development_seed_history`, not workforce tables or tenant records.

## Reproduction and repository validation

```sh
pnpm hcm:db:test
pnpm exec nx run-many -t lint,typecheck --projects=hcm-api-database-seed,hcm-api-database-kysely,hcm-api-database-migrations --parallel=2
pnpm exec nx build hcm-api --configuration=production
pnpm architecture:check
pnpm docs:check
pnpm lint:tooling
```

Changed maintained files also pass Prettier and `git diff --check`. API startup,
public contracts and browser features do not import seed infrastructure. The
initial manifest's zero modules is the required foundation state, not evidence
that a workforce dataset has been seeded. Cloud deployment and production seed
execution are outside scope; there is no production seed mode.

See [operator instructions](../engineering/DEVELOPMENT-SEEDS.md) for prerequisites,
target marking, explicit commands, safe recovery and future domain adoption.
