# HR service foundation validation

Branch: `codex/hcm-2-employee-hr-service-foundation`, started from `codex/hcm-2-probation-review`.
It carries the HR service foundation, the first part of delivery step 17 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

- **Data.** Migration `000033_employee_hr_service.sql` adds teams, memberships, versioned service
  level policies, request types, a per-tenant request number sequence (`HR-000123`), requests,
  messages, attachments, assignee history and service level targets under tenant RLS. The
  requester never writes an internal message; an attachment keeps its message's visibility and
  reads only a `service-attachment` file. A published policy is immutable apart from retiring it,
  with one published and one draft version per code. Resolved and Closed requests carry a
  resolution code, Cancelled ones a reason. Messages and attachments are append-only for the
  runtime; assignee history only ends.
- **Documents.** `document_blob` gains the purpose `service-attachment`: a verified PDF, PNG or JPEG
  of at most 10 MiB, staged and read through `DocumentStoragePort` by the HR service only; the
  document purpose trigger keeps it out of employee documents, templates and requests.
- **Contract and rules** (DEC-HCM2-004). `hr-service.ts` in the employee contract holds the desk,
  self and configuration DTOs and parsers; self DTOs have no internal message, attachment,
  assignee or internal service level field. The domain rules compute target states on a 24x7
  clock (Met, Paused, Breached once the due time passes unmet, DueSoon within two hours,
  OnTrack), the queue's next due time, due times moved by paused minutes, the approved status
  transitions, cancellation before work starts and the 7-day reopen window.
- **Lifecycle.** Shared application helpers create a request with its number, routing to the
  type's default team, both targets from the type's published policy and the description as the
  first employee-visible message; record HR replies (meeting the first response target) and
  internal notes; move statuses with pause, resume, met and reopen handling and an employee-visible
  status message; and persist derived breaches on the next write.
- **Seed.** `employee.operations@3` adds the HR Operations team led by Toby, `standard@1` with the
  approved targets (P1 4 hours and 1 day, P2 1 and 3 days, P3 2 and 5 days, P4 3 and 10 days), a
  pause while waiting for the employee and a 7-day reopen window, and five request types including
  `personal-data-correction`. No service conversation is seeded.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17.

- `libs/hcm/api/employee/domain/src/lib/hr-service-rules.spec.ts`: 4 tests pass.
- `libs/hcm/api/employee/module/src/lib/hr-service-foundation.database.spec.ts`: 4 tests pass. They
  cover the seeded configuration, internal content refused from requesters, attachment visibility
  and purpose, lifecycle and number constraints, published policy immutability and uniqueness,
  targets of every priority, and append-only conversation grants.
- The API database suites pass with 324 of 325 tests; the one failure is the environment hard-link
  test that fails the same way on the base branch.
- Lint for the changed projects, the `hcm-api` build and `pnpm hcm:db:seed:check` pass.
