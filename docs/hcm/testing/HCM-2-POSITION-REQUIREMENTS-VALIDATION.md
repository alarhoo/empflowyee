# Position Requirements validation

Branch: `codex/hcm-2-position-requirements`, started from `codex/hcm-2-positions`. It carries the
Position Requirements app, the last app of delivery step 12 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Position Requirements (`POSITION_REQUIREMENTS`) is released at
`/job-architecture/position-requirements` as `UX-FP-FCL` NATIVE, following the approved
[FDD](../apps/position-requirements/FDD.md) and [TDD](../apps/position-requirements/TDD.md).

- **API** (`/api/v1/job-architecture`): every operation listed in the TDD.
  - Reads (`position-requirements.read`): positions with the variance count of the version
    shown today (server mode, 25, `q`, `hasVariances`, sort by code then id), a position's
    effective requirements, and its job profile version's requirements.
  - Requesting (`position-requirements.request`): propose variances as a new request, and
    replace the variances of a draft request.
  - Preview, submission, withdrawal and decision use the Positions endpoints.
- **Effective requirements (REQ-POSITION-REQUIREMENTS-001).** The version shown today supplies
  its profile version's requirements with its variances applied: Replace and Strengthen show the
  position's requirement, Add appends one, and a Waive keeps the profile requirement visible,
  marked Waived and not applied.
- **Variances (REQ-POSITION-REQUIREMENTS-002, DEC-HCM2-009).** All four types are allowed. Add
  introduces a code the profile does not use; Replace, Strengthen and Waive act on a profile
  requirement under its code. Strengthen keeps the type and unit and never lowers the quantity or
  the mandatory flag. Codes are unique, quantities are non-negative and carry a unit. Each
  refusal is a field error on the variance's own field.
- **Requests (REQ-POSITION-REQUIREMENTS-004).** A proposal is a Change request on a draft
  successor with the current facts, effective from the later of today and the day after the
  current version started. Change items record each added, replaced or removed variance. An edit
  after preview returns the request to Draft and marks the preview stale. Rejected and withdrawn
  requests leave the effective set unchanged.
- **Waive (REQ-POSITION-REQUIREMENTS-003).** A Waive needs a justification of up to 2,000
  characters, stored only as `FieldCipher` ciphertext bound to the variance row and returned only
  to the requester and approvers. A request containing a Waive opens an approval case that also
  requires `position-requirements.waive`; an approver without it sees no decision action and
  the API answers 403.
- **Variances across changes.** A general Positions Change carries the current variances into its
  successor, re-sealing each justification for its new row, unless it picks another job profile;
  then the successor starts without variances and the change items say so.
- **Discovery (DEC-HCM2-022).** HR proposes variances but could not discover the app. Following
  DEC-HCM2-017 to DEC-HCM2-021, `access.discovery@8` grants `hr-specialist` discovery, and the
  app joins the HR catalogue next to Positions.
- **UI.**
  - Begin column: positions with lifecycle status, job profile, variance count and whether a
    request is in progress.
  - Mid column: Effective requirements (source and variance as inverted ObjectStatus, Waived
    Critical, mandatory as a read-only CheckBox), Proposed variances (with a remove row action
    on the requester's draft), Profile requirements and Variance history.
  - One Dialog serves Add, Replace, Strengthen and Waive; the first variance also records the
    reason. Submission opens a confirmation Dialog that previews the impact first. A request in
    flight links to Positions, where it is decided or withdrawn.

## Open points

- The requirement change becomes effective from the date set when it is proposed. A proposal
  approved on a later day still takes effect from that earlier date; it is never before the
  current version started.
- Waived requirements are not yet evaluated anywhere; candidate matching and skills assessment are
  outside HCM-2.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/job-architecture/module/src/lib/position-requirements.database.spec.ts`: 5 tests
  pass. They cover the list, the variance filter and the grants; effective and profile
  requirements; each field error; a proposal with Add, Strengthen and Waive, ciphertext-only
  justification, text-free audit, a stale preview after editing, the waive grant enforced on the
  decision, and application; the approved set in the list and the effective requirements;
  variances carried through a general change and cleared by another profile; and a withdrawn
  proposal leaving the set unchanged.
- The job architecture suite passes with 42 tests, and the access and seed suites with 22,
  including 22 seed module versions and `pnpm hcm:db:seed:check`.
- `apps/hcm/web-e2e/live/position-requirements.spec.ts`: 3 browser tests pass two runs in a row against
  the live stack, with axe on the list and the variance Dialog, together with the Positions browser spec.
- Lint for the changed projects, the `hcm-api` and `hcm-web` builds and
  `pnpm hcm:catalogue:validate` pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/job-architecture libs/hcm/api/database
pnpm exec playwright test -c <local config> live/position-requirements.spec.ts live/positions.spec.ts
```
