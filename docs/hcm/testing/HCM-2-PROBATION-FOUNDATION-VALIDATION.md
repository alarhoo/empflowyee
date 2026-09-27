# Probation foundation validation

Branch: `codex/hcm-2-employee-probation-foundation`, started from `codex/hcm-2-employee-import`. It
carries the probation foundation, the first part of delivery step 16 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

- **Data.** Migration `000032_employee_probation.sql` adds `probation_review`,
  `probation_assessment` and `probation_decision` under tenant RLS. The database keeps one open
  Final review per employment, one current assessment per review, a 1-5 integer rating, and at
  most one extension per employment; an extension must end after the date it extends. A trigger
  lets only the stored reviewer assess, and only while the review is undecided, so reporting lines
  never grant reviewer access. The runtime may insert and read assessments and decisions but never
  delete them; it updates only the supersession link of an assessment.
- **Contract and rules** (DEC-HCM2-003). `probation.ts` in the employee contract holds the case,
  review, assessment, decision and reviewer DTOs and their parsers. The domain rules compute the
  Final review due 14 days before the end date (or the first day of a shorter probation), the
  Overdue state after the due date and Escalated 7 days later, the latest extended end date (90
  days after the original end, none after one extension), and decision effects: Confirm confirms,
  Extend moves the end date, Fail marks the probation failed and never ends employment, and No
  change sets nothing.
- **Scheduling.** When an employment enters probation (worker creation in Employee Records,
  Employee Import commit, or a Rehire in Employment Changes) the same transaction creates one Final
  review without a reviewer and audits it. A Correction or other change that moves the probation
  end date moves the open Final review with it.
- **Seeds.** `workforce.foundation@5` adds the event types `PROBATION_EXTENDED` and
  `PROBATION_FAILED`. `employee.operations@2` adds Andy Bernard, a fictional Scranton hire in
  probation reporting to Michael, with his Final review owned by Toby and assigned to Michael. The
  planned `employee.operations@1` content is split across forward modules because `@1` was applied
  with the import template. No assessment, decision or notification history is seeded.

## Open points

- Clearing a probation end date through Employment Changes leaves an open Final review in place;
  HR cancels it in Probation Management.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/domain/src/lib/probation-rules.spec.ts`: 4 tests pass.
- `libs/hcm/api/employee/module/src/lib/probation-foundation.database.spec.ts`: 5 tests pass. They
  cover the seeded review, the Final review created without a reviewer by worker creation (and none
  without a probation end date), a correction moving the open review, the one-open-Final,
  stored-reviewer-only, rating, one-current-assessment, extension and one-decision constraints, and
  the runtime's append-only grants.
- The API database suites pass with 309 of 310 tests. The one failure,
  `local-document-files.spec.ts` rejecting hard links, fails the same way on the base branch in
  this environment. The workforce, directory, org chart, team, records, runtime and access
  expectations now include the seeded hire.
- The Employee Directory, Team Directory, Org Chart, Employee Records and My Profile browser specs
  pass on a freshly migrated and seeded database; Team Directory's probation filter now finds the
  seeded hire.
- Lint for the changed projects, the `hcm-api` build and `pnpm hcm:db:seed:check` pass.
