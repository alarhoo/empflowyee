# Employment Changes validation

Branch: `codex/hcm-2-employment-changes`, started from
`codex/hcm-2-employee-workforce-changes-foundation`. It carries the Employment Changes app, the app
part of delivery step 14 of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Employment Changes (`EMPLOYMENT_CHANGES`) is released at `/employee/employment-changes` as
`UX-FP-FCL` NATIVE, with new requests and draft edits on `UX-FP-WIZARD` routes. It follows the
approved [FDD](../apps/employment-changes/FDD.md) and [TDD](../apps/employment-changes/TDD.md).

- **API** (`/api/v1/employee/changes`): every operation in the TDD. Reads need `changes.read`, the
  worker context, options and the request commands `changes.request`, and decisions
  `changes.approve`. Every command reauthorizes, checks its revision and records its audit event
  and idempotency receipt in one transaction (REQ-EMPLOYMENT-CHANGES-006, -008).
- **Typed requests (REQ-EMPLOYMENT-CHANGES-001).** Each of the eleven change types names the target
  facts it accepts and requires, and its reason codes; any other target is a field error. The server
  checks references on the effective date, requires an Open position, resolves the manager to their
  primary assignment on that date, records the employment and assignment revisions the request is
  based on, and refuses a second open request on the same employment and date.
- **Approval (REQ-EMPLOYMENT-CHANGES-002, DEC-HCM2-002).** Submission snapshots
  `employment-change@1` and opens one `hr-approver` slot. The effective date may lie at most 30
  days in the past, or 90 for a Correction, checked at submission and at approval. The requester
  never decides their own request: 403 `self-approval-forbidden`, also enforced by the database.
- **Execution (REQ-EMPLOYMENT-CHANGES-003).** Final approval executes at once when every changed
  fact is dated (assignments, manager lines, a rehire's employment) or the effective date has
  come; employment status, type, probation, notice and service facts dated in the future wait until
  HR applies them. Execution closes and opens dated rows through `WorkforceFactsPort`, asks
  `PositionReadPort.capacityDecision` for any added seat or FTE (DEC-HCM2-007), and records one
  worker event per employment, all in one transaction with its execution steps. If any step is
  refused, nothing changes: a second transaction records the decision, a Failed step and a safe
  failure code, and HR may retry with Apply or cancel. Drift since the request (a changed
  revision) fails safely as `facts-changed`.
- **Rehire and correction (REQ-EMPLOYMENT-CHANGES-004).** A rehire needs every employment to have
  ended, shows rehire eligibility, and creates the next employment of the same worker (Pending for
  a future date); it never creates a person or worker. A Correction changes facts from its date
  with a reason and a `CORRECTED` event, and establishes an incomplete assignment while keeping the
  incomplete row in history.
- **Track and cancel (REQ-EMPLOYMENT-CHANGES-005).** Requests show status, approvals, execution
  steps and history. The requester cancels a request that is a draft, pending, approved or failed;
  cancelled and rejected requests change no workforce fact.
- **Discovery (DEC-HCM2-023).** Tenant administrators decide change requests but could not discover
  the app. Following DEC-HCM2-017 to DEC-HCM2-022, `access.discovery@9` grants
  `tenant-administrator` discovery, and the app joins the Tenant Administration catalogue next to
  Positions.
- **UI (REQ-EMPLOYMENT-CHANGES-007).** The list offers All, Mine and Awaiting my decision with
  change type, status, effective date range and sort, and inverted ObjectStatus for status. The
  request Object Page has Overview, Proposed changes (current against proposed in Label and Text
  cells), Approvals, Execution and History. One Dialog serves Submit, Approve, Reject, Apply (Retry
  after a failure) and Cancel. The wizard's Details step renders only the target facts of the
  chosen type, prefilled with current facts, and proposes only what changed; the effective date
  DatePicker is bounded by the backdating limit.

## Open points

- The change context shows current facts at read time, so a completed request's comparison shows
  its result as current; a snapshot of the facts at submission is not stored.
- A correction dated on the first day of the row it corrects is refused, because the dated row
  model can only close a row the day before its successor starts. Correcting an incomplete
  employment (not only an incomplete assignment) needs its own design.
- Requester and approver notifications wait for a notification event registration.
- Scheduled execution is out of HCM-2 (DEC-EMPLOYMENT-CHANGES-004); future employment facts wait
  for Apply.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/domain/src/lib/employment-change-rules.spec.ts`: 6 tests pass for
  backdating, execution timing, cancellation, independence, status transitions, capacity demand and
  event types.
- `libs/hcm/api/employee/module/src/lib/employment-changes.database.spec.ts`: 6 tests pass. They
  cover a transfer approved independently and executed with its steps, event and audit; invalid
  targets and reasons, overlap, stale revision, 30- and 90-day backdating and self-approval with
  both grants; a future suspension waiting, a current one executing and a return to work pending;
  a promotion beyond position capacity failing safely with no fact changed and then cancelled; a
  rehire creating the next employment and never a person; and idempotent replay, a conflicting
  payload, the Mine view and a reader without the grant.
- The employee, workforce foundation and job architecture suites pass with 120 tests; the access
  and seed suites with 22.
- `apps/hcm/web-e2e/live/employment-changes.spec.ts`: 2 browser tests pass three runs in a row
  against the live stack. They cover raising a change through the wizard (including the refusal to
  continue without a change, and keyboard stepping) with axe, an independent approver executing it
  from Awaiting my decision with axe on the Dialog and the page at 390, 768, 1440 and 2560 pixels,
  and a future suspension cancelled by its requester. The Employee Records and Positions browser
  specs still pass.
- Lint for the changed projects, the `hcm-api` and `hcm-web` builds, `pnpm hcm:db:seed:check` and
  `pnpm hcm:catalogue:validate` pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/employee libs/hcm/api/workforce-foundation libs/hcm/api/job-architecture
pnpm exec playwright test -c <local config> live/employment-changes.spec.ts
```
