# HCM-3 holiday draft command validation

Verified locally on 2026-09-28. This foundation implements holiday Draft creation,
exact-version read/replacement and successor creation through owner application
ports, SQL-first Kysely adapters and the existing current-authority transaction.
It uses migration 38 holiday storage and migration 40 encrypted receipts; no new
migration is required. No publication, assignment, HTTP route or UI is claimed.

Five real PostgreSQL tests pass against the restricted runtime role and canonical
persisted development sessions, with explicit test-only holiday grants. They cover
concurrent same-key creation, changed-payload retry rejection, duplicate codes,
exact actual/observed dates and fractional partial intervals, stale revisions,
immutable root identity, failed-child replacement rollback, immutable published
source/successor independence, encrypted reason evidence and safe audit/DTO output.
Foreign-tenant versions, missing grants, scoped-only grants, invented context,
revoked read permission on replay and disabled Attendance entitlement are denied.
Encryption failure and session expiry after awaited work leave no successor,
audit or receipt. Test-only SQL arranges published source input; it does not
substitute for the pending publication implementation.

The ten existing schedule Draft/publication regression tests pass after narrowing
the shared replay helper to its actual receipt/read-authorization dependencies.
The focused pure suite passes 58 tests, including whole holiday replacement
validation for revision, forbidden persistence fields, explicit observed date
and partial interval ordering. Targeted ESLint and infrastructure TypeScript
checking pass. The affected hcm-api webpack build, architecture/documentation
checks and readiness for all 61 admitted apps (including HCM-3 23/23) pass. The application/infrastructure libraries retain owner ports and
existing tenant transaction semantics; no new layer or trust boundary is added.

Codex technical review under the existing
[delegated authority](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority) confirms this
implementation follows the approved HolidayDraft, VersionDraftCommand and STORAGE
contracts. This is not a new business decision or separate human approval.
`HOLIDAY_CALENDARS` remains Planned. Dated impact/worker integration, publication,
retirement, assignment, HTTP pagination, canonical grants/seeds and native UI
acceptance still precede app completion.

Reproduce with Docker and installed repository dependencies:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/infrastructure/src/lib/holiday-commands.database.spec.ts libs/hcm/api/attendance/infrastructure/src/lib/schedule-commands.database.spec.ts
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts
pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/api/attendance/infrastructure/tsconfig.lib.json
```

The test runner provisions and removes its disposable database. It does not migrate
or reset a developer database. SQL constraints and tenant-composite references
remain authoritative alongside application validation.
