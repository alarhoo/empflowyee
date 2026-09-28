# HCM-3 dated configuration input validation

Verified locally on 2026-09-28. Attendance now composes Workforce's maintained
transaction-bound time-context port with scope-filtered configuration selection
and exact published Schedule, Policy and Holiday DTO readers. The application
port returns Available input evidence or an explicit Unavailable reason. It does
not claim to publish a workday or execute an impact calculation.

The input digest covers the tenant, configuration family, Workforce input digest,
all eligible dated assignments in stable ID order, and the exact selected version.
A newer Draft is never substituted for an assigned Published version. Employment,
Assignment, Location, Department, OrgUnit, LegalEntity and Tenant precedence remains
the existing domain rule; ties are rejected. A published all-Rest pattern remains
real configured data, distinct from missing configuration. No timezone is guessed.

Four disposable PostgreSQL integration tests pass with the restricted runtime role
and real Nest composition. They prove missing workforce/configuration states,
exact observed dates and fractional times, employment-specific selection, unchanged
selection after a newer Draft, location/assignment revision invalidation, effective
date boundaries, equal-precedence locations, retained retired source children,
all three configuration families, foreign/absent tenant denial and pool rejection.
The five holiday HTTP regression tests pass with the new module composition.
Targeted TypeScript, ESLint and the hcm-api build pass.

Both source ports share the caller-owned transaction. Callers must establish current
human/workload authorization and the existing tenant mutation/revocation lock before
using inputs for a commit. The port does not grant authority, select a primary
employment, bypass RLS, publish immutable workdays, or replace historical references.
Attendance infrastructure imports the Workforce application contract only; the
composition root supplies its implementation.

Codex technical review under the existing
[delegated authority](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority) confirms this
implements the existing owning TDD's dated selection and input-revision contract.
No new product decision, public HTTP contract or independent human approval is
claimed. Worker handlers, impact persistence/publication and app acceptance remain
pending. No new migration is needed for these reads.

Reproduce with Docker and installed dependencies:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/module/src/lib/configuration-inputs.database.spec.ts libs/hcm/api/attendance/module/src/lib/holiday-calendars.database.spec.ts
pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/api/attendance/module/tsconfig.lib.json
pnpm exec nx build hcm-api
```

The harness uses a disposable database; published/assignment SQL in these tests
arranges input fixtures and does not substitute for pending production commands.
