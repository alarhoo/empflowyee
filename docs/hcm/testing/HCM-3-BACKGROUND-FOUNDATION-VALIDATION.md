# HCM-3 background foundation validation

Verified locally on 2026-09-28 against disposable PostgreSQL 17. This evidence
covers internal workload authority, audit attribution and durable work mechanics.
It does not certify business handlers, worker deployment or application acceptance.

Migrations `000035_workload_audit.sql` and `000036_domain_durable_work.sql`
add discriminated workload audit actors and domain-owned outboxes/planner cursors.
Runtime cannot rewrite immutable intent or delete work history. Interactive audit
readers retain their existing Human-only DTO. An opaque in-process issuer supplies
workload authority; copied objects, expired contexts, suspended tenants and unsafe
database roles fail closed. The HTTP runtime module does not provide the issuer.

Executed verification:

- `workload-context.database.spec.ts` and existing `audit-log.database.spec.ts`:
  10 passing tests, including two tenants through one connection, expiry rollback,
  tenant suspension, immutable audit and exact actor constraints.
- `durable-work.database.spec.ts`: 7 passing tests covering canonical replay,
  changed-input rejection, concurrent claims, crash rollback/retry, stale fencing,
  exhausted-work quarantine, atomic planner progress and foreign-tenant denial.
- Runtime infrastructure/module and Audit infrastructure TypeScript checks pass
  with the repository test-import option `--allowImportingTsExtensions`.
- Targeted ESLint: zero errors; SQL field naming produces existing camelcase
  warnings. Prettier check, `pnpm architecture:check` and `hcm-api:build` pass.

Tests use `pnpm exec vitest run --config tools/hcm-database/vitest.config.mts`
with the named suites under `libs/hcm/api/runtime/module/src/lib/` and
`libs/hcm/api/audit/module/src/lib/`. The harness migrates and removes its own
database container. Developer databases are not reset or implicitly migrated.

The shared worker composition, domain receipts and business handlers are delivered
in subsequent slices. Work completion here proves only the atomic mechanics;
source-specific revisions, outcomes and receipt semantics remain domain-owned.
Cloud activation remains subject to the accepted ADR's infrastructure review.
