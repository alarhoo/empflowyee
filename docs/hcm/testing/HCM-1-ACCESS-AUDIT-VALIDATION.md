# HCM-1 access and audit foundation

Implemented 2026-09-24 on `codex/hcm-1-access-audit-foundation`, following the
[approved local delivery order](../roadmap/HCM-1-LOCAL-DELIVERY.md).
This is the shared prerequisite slice. Role Management and the remaining business
screens/endpoints are not yet implemented; all remain Planned.

## Delivered

- Four domain-owned Nx application/infrastructure libraries define access policy,
  the last-administrator invariant and a transaction-bound safe role-audit append port.
- Business transactions reuse verified tenant context, re-read account activation,
  current business grants and entitlements, and serialize administrative changes
  through the approved tenant advisory lock. Private runtime context now also
  retains verified account identity, independently of mutable public DTO fields.
- SQL migration `000006_access_audit_foundation.sql` adds protected/system role
  metadata, role revisions, grant occurrence identities, command receipts and
  append-only audit storage with tenant RLS and minimum runtime grants.
- Seed module `access.business@1` registers the approved 39 business permissions
  and persona grants. It creates no historical audit events. All applied HCM-0
  migration/seed contents and discovery grants remain unchanged.
- Twenty app approval ledgers and canonical route/floorplan summaries now pass
  actual readiness checks. The six production-integration apps remain deferred.

## Verification

`pnpm hcm:db:test`: 47 tests pass against disposable PostgreSQL 17, including a
populated HCM-0 upgrade and repeat migration/seed no-ops. Tests cover preserved
identities/discovery grants, copied/mutated session authority, disabled accounts,
revoked grants, disabled entitlements, cross-tenant associations, audit immutability,
audit failure rollback, and racing removals of the final two administrators.

The focused Nx target is `pnpm nx test hcm-api-access-control-infrastructure`.
API and web production builds pass. A direct infrastructure TypeScript check uses
`pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/api/access-control/infrastructure/tsconfig.lib.json`
because the integration tests import the existing Node-executed seed tooling.
Lint, formatting, architecture, documentation/catalogue, seed projection and page
structure checks pass; the 15 factory regression tests pass.

## Persistent local result

`pnpm hcm:db:up` explicitly applied one new migration and one new seed version to
the existing `empflowyee-hcm-postgres` volume at `127.0.0.1:55432`.
Database verification returned six migration records, five seed versions, four
people/workers/employments/assignments/accounts, 170 discovery permissions, 268
unchanged discovery grants and 39 business permissions. All four seed roles are
system roles; only `tenant-administrator` is protected. Audit is empty until actual
commands execute. Credentials remain in the ignored local configuration file.

## Review boundary and next slice

No HTTP business mutation is exposed by these libraries. Origin enforcement,
transport validation, role command idempotency/revisions, the native Role Management
screen and browser acceptance belong to the next vertical slice. The new libraries
do not claim those acceptance tests. Application/domain layers contain no Kysely
or Nest dependencies; persistence and transaction binding remain infrastructure-owned.

Rollback disables the consuming business route/artifact and preserves additive
schema/data. No down migration, implicit startup migration or local reset was run.
