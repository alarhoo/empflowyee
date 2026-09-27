# Probation Management validation

Branch: `codex/hcm-2-probation-management`, started from
`codex/hcm-2-employee-probation-foundation`. It carries the Probation Management app, part of
delivery step 16 of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Probation Management (`PROBATION_MANAGEMENT`) is released at `/employee/probation-management` as
`UX-FP-FCL` NATIVE. It follows the approved [FDD](../apps/probation-management/FDD.md) and
[TDD](../apps/probation-management/TDD.md).

- **API** (`/api/v1/employee/probation`): cases, reviews, one review, options, schedule, reviewer,
  cancel and decision. Reads need `probation.read`; options and commands `probation.manage`.
  Every command reauthorizes, checks its revision and records its audit event and idempotency
  receipt in one transaction (REQ-PROBATION-MANAGEMENT-005, -007).
- **Cases (REQ-PROBATION-MANAGEMENT-001).** Only employments InProgress or Extended are listed,
  with the next open review; views Due soon (within 30 days), Overdue and All, and worker search,
  sorted by due date then employment. Overdue and Escalated are computed on the server in the
  organisation time zone.
- **Scheduling and reviewers (REQ-PROBATION-MANAGEMENT-002).** The Final review is created by the
  probation foundation. HR schedules ad-hoc reviews, may not open a second Final review, and assigns
  an explicit reviewer who must be an enabled account holding `probation.review`; the current
  primary manager is only suggested. Reassignment replaces the stored reviewer at once.
- **Decisions (REQ-PROBATION-MANAGEMENT-003).** Confirm, Extend, Fail or No change with an
  effective date and reason, separate from the assessment. Confirm and Extend update employment
  probation facts through `WorkforceFactsPort`, Fail marks the probation failed, and a worker event
  (`CONFIRMED`, `PROBATION_EXTENDED` or `PROBATION_FAILED`) is recorded. Extend is allowed once, up
  to 90 days past the original end date, and schedules the next Final review with the same
  reviewer; the prior decision stays in history. Fail never ends employment.
- **Escalation (REQ-PROBATION-MANAGEMENT-004).** A review undecided 7 days after its due date shows
  Escalated. No notification is sent or fabricated.
- **UI (REQ-PROBATION-MANAGEMENT-006).** Case list with views and search, inverted ObjectStatus for
  probation and review states (Overdue and Escalated Negative); the review Object Page has
  Overview, Reviews, Assessments, Decision and History (UI5 Timeline). One Dialog serves schedule,
  reviewer, cancel and decision; the extended end date appears only for Extend and is bounded by
  the server's limit, and Extend is not offered after an extension.

## Open points

- Reviewer assignment and escalation notifications wait for a notification event registration and
  a background runtime (DEC-PROBATION-MANAGEMENT-004); HCM-2 shows the states on read.
- The API filters cases by unit; the list offers views and worker search only.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/module/src/lib/probation-management.database.spec.ts`: 4 tests pass. They
  cover the case list and 403 for Jim, Michael and David, Overdue and Escalated at read time, the
  review detail with minimal context and the suggested reviewer, refused reviewer assignments,
  scheduling with idempotent replay and a conflicting payload, the refused second Final review,
  cancellation and the refused decision on it, an extension beyond 90 days refused, an extension
  that updates employment facts, records its event and schedules the next review, a second
  extension refused, and Fail leaving employment active with no exit.
- `apps/hcm/web-e2e/live/probation-management.spec.ts`: 2 browser tests pass three runs in a row.
  They cover a hire in probation found by search, reviewer assignment and an extension through the
  Dialog, the next Final review keeping the reviewer and not offering Extend again, axe on the page
  and the Dialog, and a persona without access.
- Lint for the changed projects and the `hcm-api` and `hcm-web` builds pass.
