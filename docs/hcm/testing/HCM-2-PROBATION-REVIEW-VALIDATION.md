# Probation Review validation

Branch: `codex/hcm-2-probation-review`, started from `codex/hcm-2-probation-management`. It
carries the Probation Review app, the last part of delivery step 16 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Probation Review (`PROBATION_REVIEW`) is released at `/employee/probation-review` as `UX-FP-FCL`
NATIVE with the assessment on its own route. It follows the approved
[FDD](../apps/probation-review/FDD.md) and [TDD](../apps/probation-review/TDD.md).

- **API** (`/api/v1/employee/me/probation-reviews`): list, read and submit an assessment, all
  needing `probation.review`. Every query carries the stored-reviewer predicate, so another
  review is not found (404); submission records its audit event and idempotency receipt in one
  transaction.
- **Assigned reviews (REQ-PROBATION-REVIEW-001).** Only reviews whose stored reviewer is the
  verified account are listed. Being the worker's manager without being the stored reviewer shows
  nothing, and reassignment removes access on the next request.
- **Assessment (REQ-PROBATION-REVIEW-002).** Recommendation (Confirm, Extend, Fail, No change), an
  integer rating from 1 to 5, strengths, concerns and a required reason; the review moves to
  Assessment submitted and HR sees the current assessment.
- **Supersession (REQ-PROBATION-REVIEW-003).** A new submission supersedes the current one while
  the review is undecided; superseded versions stay in history. After the HR decision a
  submission returns 409, and the database refuses it too.
- **Minimal context (REQ-PROBATION-REVIEW-004).** The reviewer DTO holds name, number,
  designation, unit, hire date and the probation period, and earlier decisions as outcome and
  date only; no personal, contact or family field and no HR reason.
- **UI (REQ-PROBATION-REVIEW-005).** List with a status filter and inverted ObjectStatus; the
  review Object Page has Employee, Assessment and History sections; the assessment page uses a
  Select, a UI5 RatingIndicator with `max=5` and TextAreas, with dirty-leave protection.

## Open points

- HR is not notified on submission until a notification event registration exists; HR sees the
  Assessment submitted state and the assessment in Probation Management.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/module/src/lib/probation-review.database.spec.ts`: 3 tests pass. They
  cover Michael's own list and 403 for Jim, Toby and David, nothing listed and 404 once Michael is
  no longer the stored reviewer, the minimal context with no personal data, ratings and
  recommendations refused outside the contract, a missing reason refused, supersession with
  history, a stale revision refused, HR seeing the current assessment and deciding, and the
  assessment locked afterwards with earlier decisions shown without HR's reason.
- `apps/hcm/web-e2e/live/probation-review.spec.ts`: 2 browser tests pass three runs in a row
  together with the Probation Management spec. They cover a review assigned through the API, the
  list and review page without personal data, a refused submission without a rating, a submitted
  assessment, a superseding update after the dirty-leave prompt, axe on the list and the
  assessment page, and a persona without the reviewer grant.
- Lint for the changed projects and the `hcm-api` and `hcm-web` builds pass.
