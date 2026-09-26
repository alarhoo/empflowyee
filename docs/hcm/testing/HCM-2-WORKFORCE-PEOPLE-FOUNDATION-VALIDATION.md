# Workforce people foundation validation

Branch: `codex/hcm-2-catalogue-organization-structure`. It carries delivery step 7 of
the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order): migrations
`000019`–`000020`, `WorkforceFactsPort`, the reporting queries and
`workforce.foundation@3`. No app is released by this step.

## Delivered

- **`000019_workforce_people.sql`.**
  - Tenant lookups `worker_type`, `employment_end_reason` and `worker_event_type`.
  - `person` and `worker` evolution. New columns are appended and nullable or
    defaulted, so the version-1 seed and positional test inserts stay valid.
  - `person_address`, with one primary address per person per period enforced by an
    exclusion constraint.
  - `person_contact_point`: unverified, with one active primary per type.
  - `person_relationship`: one priority per active emergency contact. The statutory
    nominee columns have no runtime write grant.
  - A trigram GiST index on the names-only `person.search_text`.
- **`000020_workforce_employment.sql`.**
  - `employment` and `assignment` evolution with all-or-none established-fact
    CHECKs.
  - Exclusion constraints: no overlapping employment per worker and legal entity,
    one primary employment per worker, and one primary assignment per employment.
  - `reporting_line`, with one primary solid line per assignment per period.
  - Append-only `worker_event`.
  - Assignments and reporting lines are superseded, never rewritten: runtime may
    update only the closing columns. RLS is forced on every new table.
- **`workforce.foundation@3`.**
  - Tenant lookups.
  - The four version-1 people established: legal entity DMPC, departments,
    designations and effective-from 2005-01-01 placements.
  - Dwight Schrute, Pam Beesly, Angela Martin and Oscar Martinez as workers without
    accounts.
  - Primary solid lines: Jim, Dwight and Pam to Michael; Michael and Toby to David,
    per the seed plan. Angela and Oscar have no manager and are org-chart roots.
- **Ports** (`hcm-api-workforce-foundation-application`, implemented in
  infrastructure):
  - `WorkforceFactsPort` provides `createPersonWithWorker`, `correctPersonFacts`,
    `mergePerson`, `createEmployment`, `openAssignment`, `supersedeAssignment`
    (which carries open reporting lines to the successor), `setReportingLine`
    (with primary-chain cycle check), `applyEmploymentFacts` (which keeps worker
    engagement current) and `recordWorkerEvent`.
  - `WorkforceReadPort` provides `currentAssignments`, `primaryManager`,
    `directReports` and `duplicateCandidates` (DEC-HCM2-001: normalized legal name
    plus birth date, or work email).
  - `WorkforcePortBinder` binds both ports to another domain's open transaction; the
    module exports it.

## Verification

Recorded on 2026-09-26.

- `libs/hcm/api/workforce-foundation/module/src/lib/workforce-people.database.spec.ts`:
  5 tests pass, run as the restricted runtime role. They cover:
  - the seeded reporting structure and dated visibility;
  - minimal-row compatibility, the established-fact CHECK and the overlap exclusion;
  - the command lifecycle: hire, report, overlapping supersede refused, transfer
    carrying the line, cycle refused, assignment before hire refused, promotion
    event, exit updating engagement, and a stale revision refused;
  - `record-incomplete`, duplicate candidates with accents and case, and merge
    limits;
  - foreign-tenant invisibility and refusal of forbidden writes: assignment rewrite,
    event change or delete, nominee write, line re-point and line delete.
- `pnpm hcm:db:test`: 178 of 179 tests across 28 files pass. The one failure is the
  pre-existing Linux-only `local-document-files.spec.ts` case. The database
  inventory, runtime persona and access snapshot specs were updated for the eight new
  tables and the four seeded workers.
- The local database applied both migrations and the seed through `pnpm hcm:db:up`.
  The Organization Structure and Identification Types browser suites still pass
  (10 tests), in two consecutive runs. The Organization Structure helper now retries
  the native toolbar overflow, which can open without its popover while an FCL column
  resizes (a known shared watch item).

## Open points

- **Position occupancy.** `PositionOccupancyPort` needs `assignment.position_id`,
  which migration `000024` adds in step 12. It is not declared yet; it is delivered
  with the positions foundation.
- **Structure usage counts.** Organization Structure's unit usage still counts every
  assignment row of the unit. Now that assignments are dated, counting only
  assignments effective on the as-of date is a small follow-up for that app.
