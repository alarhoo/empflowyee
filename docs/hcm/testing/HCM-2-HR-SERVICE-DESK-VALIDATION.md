# HR Service Desk validation

Branch: `codex/hcm-2-hr-service-desk`, started from `codex/hcm-2-employee-hr-service-foundation`.
It carries the HR Service Desk app, part of delivery step 17 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

HR Service Desk (`HR_SERVICE_DESK`) is released at `/employee/hr-service-desk` as `UX-FP-FCL`
NATIVE. It follows the approved [FDD](../apps/hr-service-desk/FDD.md) and
[TDD](../apps/hr-service-desk/TDD.md).

- **API** (`/api/v1/employee/hr-service`): queue, one request, messages, options, create, message
  (multipart: JSON metadata, then an optional file of at most 10 MiB), assignment, status,
  attachment download and configuration list, create and update. Requests need
  `hr-service.handle`; configuration needs `hr-service.configure`. Every command reauthorizes,
  checks its revision and records its audit event and idempotency receipt in one transaction
  (REQ-HR-SERVICE-DESK-007).
- **Queue (REQ-HR-SERVICE-DESK-001).** Views assigned, teams and all; filters status, priority,
  type and SLA state; search on request number and subject; sorted by the earliest running target.
- **Visibility (REQ-HR-SERVICE-DESK-002).** Replies are employee-visible; internal notes and their
  attachments are internal. An attachment takes the visibility of its message. Files are verified
  PDF, PNG or JPEG by content; others are refused with 415. Downloads are audited and sent with
  `nosniff` and a sandbox content security policy.
- **Routing (REQ-HR-SERVICE-DESK-003).** Assignment names an active team and optionally an agent;
  an agent must be an account that can handle requests. Membership routes work but authorizes
  nothing.
- **Lifecycle and service levels (REQ-HR-SERVICE-DESK-004, -005).** Only the allowed transitions
  are accepted (409 otherwise). The first employee-visible reply meets the first response target
  and opens a New request. Waiting for employee pauses unmet targets and leaving it moves their due
  times; resolving needs a resolution code and summary and meets both targets. Each status change
  adds an employee-visible status message. Breaches are derived when a due time passes and
  persisted on the next write.
- **Configuration (REQ-HR-SERVICE-DESK-006).** Teams, memberships, request types and service
  levels. A service level is created as a draft version, edited, then published; published versions
  cannot change and apply to new requests only. A request type must name an active team and a
  published service level code.
- **UI (REQ-HR-SERVICE-DESK-008).** Queue with views, filters and growing; the request Object Page
  has Conversation, Details, Service levels, Assignment history and Attachments; one Dialog raises,
  assigns or moves a request, another edits configuration.

## Implementation decisions

- Every message, internal notes included, advances the request revision so open views see the
  conversation change.
- Configuration items are edited in a Dialog opened from the configuration table rather than a
  separate configuration Object Page; each item has few fields and no child sections.
- The multipart reader of Employee Import now takes a size limit and an optional file, and is
  shared by both apps.

## Open points

- Reply and status notifications wait for a notification event registration; HCM-2 shows the
  conversation and status on read.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/module/src/lib/hr-service-desk.database.spec.ts`: 5 tests pass. They
  cover a created request with its targets, number, routing, queue and audit; an internal note with
  a PDF that leaves the request New, the reply that opens it and meets first response, a stale
  revision refused, the conversation, an audited download and a spoofed PDF refused; routing
  refused to a non-agent, assignment and the assigned view, a skipped transition refused, the
  paused clock, resolution without a code refused, resolution and close, and a message refused on
  a closed request; a draft service level refused as a request type reference until published, a
  published version frozen and a membership for a non-agent refused; and 403 for Jim.
- `employee-import.database.spec.ts` and `hr-service-foundation.database.spec.ts` still pass with
  the shared multipart reader.
- `apps/hcm/web-e2e/live/hr-service-desk.spec.ts`: 3 browser tests pass. They cover a request
  found by search, an internal note and a reply through the composer, assignment and resolution
  through the Dialog, the Met state in the queue, the configuration view with a frozen published
  service level, axe on the page, the Object Page and both Dialogs, and a persona without access.
- Lint for the changed projects and the `hcm-web` build pass.
