# Team Directory validation

Branch: `codex/hcm-2-team-directory`, started from `codex/hcm-2-employee-directory`. It carries
the fourth app of delivery step 10 of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Team Directory (`TEAM_DIRECTORY`) is released at `/employee/team-directory` as `UX-FP-FCL`
NATIVE, following the approved [FDD](../apps/team-directory/FDD.md) and
[TDD](../apps/team-directory/TDD.md).

- **API** (`/api/v1/employee/team`, read-only):
  - `GET` pages the actor's team (25 per page) with name search and `locationId` and
    `probationStatus` filters.
  - `GET {workerId}` returns one member. A worker outside the actor's team is 404.
  - Both require `hcm.employee.team.read` and entitlement `hcm.employee`.
- **Scope (DEC-HCM2-015).**
  - `TeamScopeResolver` resolves the team on every request: workers with an assignment whose
    current primary solid line points to one of the actor's current assignments. The member
    query reapplies those ids inside the same transaction.
  - Dotted, temporary and indirect lines never count, and a moved line changes the team on
    the next request.
  - The reporting line only selects subjects: without the explicit team grant the request is
    denied.
- **Manager allowlist.**
  - Fields pass through `ProfileFieldVisibilityPort` for the Manager relation: placement,
    work email, worker number, worker type, employment type and status, hire and continuous
    service dates, probation status and end date, notice period, work mode, FTE, weekly hours
    and cost centre.
  - Birth date, address, personal contacts, family, blood group and identifiers never appear.
  - Dunder Mifflin's `work-mode` narrowing to managers is visible here and not in the
    organisation-wide directory.
- **Workforce data.**
  - `WorkforceDirectoryPort` rows gained the primary employment and assignment facts, and its
    filter gained `probationStatus`.
  - The organisation-wide directory projection never serializes the new facts; its browser
    suite still passes.
- **UI.**
  - Begin column: `HcmDynamicPage` with a name search, a server-filtered location ComboBox
    and a probation Select in the header, and a server-mode table (25, growing, whole-row
    navigation) with inverted ObjectStatus for employment and probation status.
  - Mid column: `HcmObjectPage` per member with Overview, Employment and Probation. Dates use
    the shared formatter, and work email uses a `mailto:` Link.
  - The location options reuse the directory options endpoint, which every persona holding a
    team grant can also read.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/employee/module/src/lib/team-directory.database.spec.ts`: 3 tests pass. They
  cover:
  - Michael's team of Dwight, Jim and Pam, a dotted line excluded, a moved line removing
    Jim from list and detail, name search, the probation filter, and a refused probation
    value (REQ-001);
  - the manager-visible facts of Jim with no personal field present, and an out-of-scope
    worker 404 (REQ-002);
  - Jim, Toby and David denied, Michael denied once his team grant is removed although his
    lines are unchanged, a disabled entitlement, and no mutation routes (REQ-003).
- The employee database suite passes (27 tests).
- `apps/hcm/web-e2e/live/team-directory.spec.ts`: 3 live browser tests pass. They cover:
  - the team list with statuses and a probation filter with no results;
  - member facts across the three sections with no personal data;
  - 390/768/1440/2560 widths with axe.
- The Employee Directory browser suite still passes (4 tests).
- Also passing: `hcm-web` and `hcm-api` production builds, lint for the changed projects,
  `pnpm ux:check-pages`, `pnpm architecture:check`, `pnpm docs:check` and
  `pnpm hcm:app:readiness --app=TEAM_DIRECTORY --check`.

Axe excludes only the shared findings recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).

## Reproduction

```bash
pnpm hcm:db:up
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/employee
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts team-directory.spec.ts
pnpm hcm:app:readiness --app=TEAM_DIRECTORY --check
```
