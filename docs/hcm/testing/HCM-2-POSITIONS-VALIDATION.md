# Positions validation

Branch: `codex/hcm-2-positions`, started from
`codex/hcm-2-job-architecture-positions-foundation`. It carries the Positions app of delivery
step 12 of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Positions (`POSITIONS`) is released at `/job-architecture/positions` as `UX-FP-FCL` NATIVE,
following the approved [FDD](../apps/positions/FDD.md) and [TDD](../apps/positions/TDD.md).

- **API** (`/api/v1/job-architecture`): every operation listed in the TDD.
  - Reads (`positions.read`): positions (server mode, 25, `q`, `status`, `unitId`,
    `departmentId`, `locationId`, `profileId`, `hasVacancy`, sort by code or name), one
    position, its incumbents and versions, change requests (`status`, `positionId`, `view`
    of `mine` or `awaiting-my-decision`) and one change request.
  - Requesting (`positions.request`): options for proposal references, create and update a
    request, preview, submit and withdraw.
  - Deciding (`positions.approve`): approve or reject.
  - Every request needs entitlement `hcm.job-architecture`. Creation returns 201 and every
    mutation requires an `Idempotency-Key`.
- **Occupancy (REQ-POSITIONS-001).** Occupancy comes from `PositionOccupancyPort` on today's
  business date. Remaining capacity is shown only when occupancy is complete; otherwise
  counts and remaining are null and the UI says _Occupancy unavailable_. The vacancy filter
  scans further pages so a page is filled with matching positions, and positions with
  unknown occupancy match neither vacancy choice.
- **Requests (REQ-POSITIONS-002, REQ-POSITIONS-003).**
  - Create stores a Planned position with a draft version 1 and the proposed name and solid
    line; Change stores a draft successor of the current version; Freeze, Reopen, Close and
    Cancel store only the lifecycle transition. One request is in flight per position.
  - Proposals are checked on their effective date: a published profile version, a grade it
    allows, active structure references, FTE capacity at most the headcount capacity, a
    successor starting after the current version, and a reporting line that is neither the
    position itself nor a cycle. Duplicate codes answer `duplicate-code` on `code`.
  - Change items record each changed field with old and new value digests and a safe
    summary; identifiers are never shown.
  - Only the requester edits, previews, submits or withdraws a request. An edit after preview
    returns the request to Draft and marks the preview Stale.
  - Preview records active assignments and FTE (null when occupancy is incomplete), solid-line
    children, other relationships, a 15-minute expiry and a digest of the position's state,
    the proposed version, name, reporting line and variances. Submission needs the newest
    Ready, unexpired preview with a matching digest, else 409 `preview-stale`.
  - Cancel is refused unless occupancy is known and empty. A capacity reduction below
    today's occupancy is refused with `capacity-exceeded` (DEC-HCM2-007).
- **Decision (REQ-POSITIONS-004, DEC-HCM2-008).**
  - Submission opens one approval case bound to the request revision and the preview; a
    request with a waived requirement also needs `position-requirements.waive`.
  - The requester never decides, whatever their grants (`self-approval-forbidden`, backed by
    the database trigger). The decision rechecks the preview digest; a second decision is
    refused.
  - Approval applies in the same transaction: the proposed version is published with a source
    digest, the version it replaces closes the day before, the position's name, lifecycle and
    current version move, and the solid line is replaced from the effective date. Lifecycle
    requests change only the status. No assignment is ended (business rule 17).
  - Rejection needs a comment, cancels the proposed version and cancels a never-published
    position; its code stays reserved.
- **Confidentiality.** Reasons, withdrawal reasons and decision comments are stored only as
  `FieldCipher` ciphertext bound to their row and column, and returned only to the requester
  and holders of `positions.approve`. Audit evidence records the action, target, changed field
  names and states, never the text.
- **Discovery (DEC-HCM2-021).** Administrators decide requests but could not discover the app.
  Following DEC-HCM2-017 to DEC-HCM2-020, `access.discovery@7` grants `tenant-administrator`
  discovery, and the app joins the Tenant Administration catalogue next to Job Catalogue.
- **UI.**
  - Begin column: positions with inverted lifecycle status, placement, capacity, occupancy,
    remaining capacity (Critical _Full_ or _Occupancy unavailable_ with text) and the open
    request; or change requests.
  - Mid column: Overview, Capacity and incumbents (Avatar and name, growing), Relationships,
    Versions (UI5 Timeline) and Change requests. Request actions appear only for requesters
    and only while no request is open.
  - End column: Request details, Proposed changes, Impact preview and Decision. The next step
    is ordered first so it stays visible in a narrow column.
  - The dedicated editor uses server-filtered ComboBoxes for the profile, structure and
    reporting line, a Select of the profile's allowed grades, StepInputs for capacities, a
    CheckBox for the key-position flag and a DatePicker for the effective date.
  - Lifecycle requests, withdrawal and decisions use a focused Dialog with retry keys and
    discard confirmation; a rejection requires a comment.

## Open points

- The TDD's requester notification needs a notification event port for position changes;
  the notifications domain currently publishes document events only. The requester sees the
  outcome in the app.
- Workforce commands that link an assignment to a position must ask
  `PositionReadPort.capacityDecision` in their transaction. The first such command arrives
  with Employee Records and the workforce change apps.
- A future-dated approval moves the current pointer immediately, as catalogue publication
  does; date-accurate reads use the version's effective range.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/job-architecture/module/src/lib/positions.database.spec.ts`: 8 tests pass. They
  cover the list, occupancy, remaining capacity and vacancy paging; the detail, incumbents,
  relationships, versions and options; create through preview, submission and approval with
  ciphertext-only reasons and text-free audit; invalid proposals; stale, edited and expired
  previews with withdrawal; lifecycle changes that keep assignments; rejection with a comment
  and hidden reasons for other readers; and self-approval, idempotent replay and
  requester-only changes.
- The job architecture, database and access suites pass (60 and 22 tests), including the
  foundation spec with migration `000028`, the seed suite with 21 module versions and
  `pnpm hcm:db:seed:check`.
- `apps/hcm/web-e2e/live/positions.spec.ts`: 4 browser tests pass three runs in a row against
  the live stack, with axe on the list, the editor and the three-column view. The Job
  Catalogue browser spec still passes.
- Lint for the changed projects, the `hcm-api` and `hcm-web` builds, `pnpm architecture:check`
  and `pnpm hcm:catalogue:validate` pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/job-architecture libs/hcm/api/database
pnpm hcm:db:up && pnpm dev:hcm-api & pnpm dev:hcm &
pnpm exec playwright test -c <local config> live/positions.spec.ts
```
