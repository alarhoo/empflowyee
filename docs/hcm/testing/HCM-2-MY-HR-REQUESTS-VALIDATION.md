# My HR Requests validation

Branch: `codex/hcm-2-my-hr-requests`, started from `codex/hcm-2-hr-service-desk`. It carries the
My HR Requests app and the My Profile correction action, and completes delivery step 17 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

My HR Requests (`MY_HR_REQUESTS`) is released at `/employee/my-hr-requests` as `UX-FP-FCL`
NATIVE. It follows the approved [FDD](../apps/my-hr-requests/FDD.md) and
[TDD](../apps/my-hr-requests/TDD.md).

- **API** (`/api/v1/employee/me/hr-requests` and `/me/hr-request-types`): list, one request,
  messages, types, create and reply (multipart: JSON metadata, then an optional file of at most
  10 MiB), cancel, reopen and attachment download. Reads need `hr-requests.self.read`; types and
  commands `hr-requests.self.manage`. The scope is the caller's own requests; another worker's
  request is 404 (REQ-MY-HR-REQUESTS-005). Every command checks its revision and records its audit
  event and idempotency receipt in one transaction (REQ-MY-HR-REQUESTS-007).
- **Raise (REQ-MY-HR-REQUESTS-001).** Only active types with the Employee audience are offered and
  accepted; the request takes the type's default priority, team and published service level. The
  description is the first message.
- **Conversation (REQ-MY-HR-REQUESTS-002).** Only employee-visible messages and attachments are
  read. Messages are attributed to You or HR; agent names, assignment and service level fields are
  not part of the DTOs. A reply while HR waits on the employee returns the request to Waiting for
  HR and resumes the paused targets.
- **Cancel and reopen (REQ-MY-HR-REQUESTS-003).** Cancel is allowed while New or Open, with a
  reason. Reopen is allowed while Resolved and within the policy's reopen window (7 days in
  `standard@1`), measured on the database clock; afterwards it returns 409. Closed and Cancelled
  requests take no replies.
- **Correction prefill (REQ-MY-HR-REQUESTS-004).** My Profile shows Request correction for
  ServiceRequest personal fields once My HR Requests is released and discoverable for the viewer.
  The link opens `?new=personal-data-correction&field=<code>`; the Dialog preselects the type and
  names the field in the subject, never its value, and waits for the worker to submit.
- **UI (REQ-MY-HR-REQUESTS-006).** Open and Closed views, a request Object Page with Conversation,
  Details and Attachments, one Dialog for new, cancel and reopen.

## Implementation decisions

- The subject of a prefilled correction names the field by its code in words, such as
  "Correct my legal given name", because the link carries only the code.
- Reopening restarts the resolution target with its due time moved by the time spent resolved, as
  in the HR Service Desk.

## Open points

- Notifications to the routed team on creation wait for a notification event registration.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/module/src/lib/my-hr-requests.database.spec.ts`: 4 tests pass. They cover
  the employee types, an HR-only type refused, a request with a PNG attachment and no desk fields,
  the default priority, the open list; internal notes and attachments hidden and a 404 for the
  internal attachment and for Michael; a reply that returns a waiting request to HR and an own
  attachment download; cancel, a reply refused after it, cancel refused on a resolved request,
  reopen within the window and reopen refused 8 days after resolution.
- `hr-service-desk.database.spec.ts` still passes.
- `apps/hcm/web-e2e/live/my-hr-requests.spec.ts`: 2 browser tests pass three runs in a row. They
  cover the My Profile correction link, the prefilled Dialog, submission and cancellation, a reply
  while HR waits, reopening a resolved request, and axe on the page, the Object Page and the
  Dialog. `my-profile.spec.ts` now expects the correction link and passes;
  `hr-service-desk.spec.ts` still passes.
- Lint for the changed projects, the navigation catalogue tests, `pnpm hcm:db:seed:check` and the
  `hcm-web` build pass.
