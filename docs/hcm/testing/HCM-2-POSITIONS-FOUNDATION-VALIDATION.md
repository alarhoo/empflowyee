# Positions foundation validation

Branch: `codex/hcm-2-job-architecture-positions-foundation`, started from the step 3 branch
`codex/hcm-2-field-cipher`. It carries the foundation part of delivery step 12 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order): migrations `000026`
and `000027` (planned as `000023`–`000024`), `job.architecture@2`, and the ports the
Positions and Position Requirements apps build on. No app is released by this step.

## Delivered

- **`000026_job_architecture_positions.sql`.**
  - Tenant tables `position`, `position_version`, `position_requirement`,
    `position_relationship`, `position_change_request`, `position_change_item`,
    `position_impact_preview`, `position_approval_case` and `position_decision`, each with
    forced RLS.
  - A position stores no person. Lifecycle is Planned, Open, Frozen, Closed or Cancelled;
    codes are unique and fixed for life.
  - Position versions (business rules 7, 10 and 11):
    - the grade must be allowed by the selected profile version (composite foreign key to
      `job_profile_grade`);
    - headcount and FTE capacity are positive and FTE capacity never exceeds headcount
      capacity;
    - a version leaving draft references a published profile version;
    - published versions of one position never overlap, and are immutable apart from being
      closed (the shared architecture trigger).
  - Requirement variances Add, Replace, Strengthen and Waive (DEC-HCM2-009): Add has no
    source, the others act on a profile requirement; a Waive always carries an encrypted
    justification; variances change only while their version is a draft.
  - Relationships never self-reference, and a position has at most one solid line at a time.
    Cycles are refused by the command.
  - Change requests: Create and Change propose a version, lifecycle requests do not, and
    Create has no base version. The reason is stored only as ciphertext. One request is in
    flight per position.
  - Impact previews carry occupancy only when complete, the source digest and an expiry.
  - DEC-HCM2-008: one open approval case per request and one decision per case. A trigger
    refuses a decision by the requester, whatever their permissions.
  - Codes, requesters, decisions and relationships are fixed for the runtime.
- **`000027_workforce_assignment_position.sql`.** Assignments gain an optional
  `position_id` with a tenant-composite foreign key and a period index. The runtime may set
  it on new assignments only; linking is a workforce fact, not a position edit.
- **`job.architecture@2`.** Six published Scranton positions from 2005-01-01 on the example
  profiles, sized so the existing assignments fit: Sales Representative (headcount 2),
  Assistant to the Regional Manager, Regional Manager (key position), Human Resources
  Representative, Accountant (headcount 2) and Senior Accountant. Solid lines lead the sales
  positions to the Regional Manager and the Accountant to the Senior Accountant. Jim, Dwight,
  Michael, Toby, Oscar and Angela's assignments are linked. The reset removes exactly these
  rows and links.
- **Workforce ports.**
  - `PositionOccupancyPort`: occupancy per position on a date and the incumbents of one
    position. Occupancy counts assignments of Active, On notice and Suspended employments. A
    linked minimal spine assignment, or one without FTE or employment status, makes
    occupancy incomplete, and the counts are then null, never zero (business rule 14).
  - `StructureReferencePort`: structure options, active-reference checks and labels for
    legal entities, units, departments, designations and locations.
- **Job architecture.**
  - Contract: position vocabulary, DTOs and request parsers for positions, change
    requests, previews, decisions, variances and effective requirements.
  - Domain: remaining capacity, the DEC-HCM2-007 capacity decision, lifecycle transitions,
    cancellation, preview validity, the independent decider, cycle refusal, variance
    validation and effective requirements.
  - `PositionReadPort` (placement, capacity decision, effective requirements) with its
    binder, exported by the job architecture module for other domains.

## Verification

Recorded on 2026-09-26 against disposable PostgreSQL 17.

- `libs/hcm/api/job-architecture/module/src/lib/positions-foundation.database.spec.ts`:
  6 tests pass. They cover:
  - the seeded positions: placement, complete occupancy, incumbents, profile-derived
    requirements, and no version before the effective date;
  - capacity: partial FTE within capacity, FTE and headcount overfill refused, no version
    on the date, a frozen position, and a linked spine assignment giving
    `occupancy-unknown` with null counts;
  - structure labels, options and an unknown reference;
  - database invariants: a grade the profile does not allow (`23503`), FTE above headcount
    and zero capacity (`23514`), overlapping published versions (`23P01`), a change to a
    published version, variances on a published version, Waive without justification and
    Add with one (`23514`), self-reference and a second solid line;
  - one request in flight and one decision (`23505`), self-decision refused by trigger
    (`23514`), a lifecycle request with a proposed version (`23514`), and codes and
    decisions fixed for the runtime (`42501`);
  - tenant isolation.
- `hcm-api-job-architecture-domain`: 11 rule tests pass (4 catalogue, 7 position).
- `database.integration.spec.ts` lists the new tables. The seed suite passes with 20 module
  versions. `pnpm hcm:db:seed:check` reports the spine projection current.
- Lint for the changed projects, the `hcm-api` build and `pnpm architecture:check` pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/job-architecture libs/hcm/api/database
pnpm hcm:db:seed:check
```
