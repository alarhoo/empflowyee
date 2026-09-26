# Job Catalogue validation

Branch: `codex/hcm-2-job-catalogue`, started from
`codex/hcm-2-job-architecture-catalogue-foundation`. It carries the app half of delivery step 11
of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Job Catalogue (`JOB_CATALOGUE`) is released at `/job-architecture/job-catalogue` as `UX-FP-FCL`
NATIVE, following the approved [FDD](../apps/job-catalogue/FDD.md) and
[TDD](../apps/job-catalogue/TDD.md).

- **API** (`/api/v1/job-architecture`): every operation listed in the TDD.
  - Reads (`catalogue.read`): catalogues, one catalogue version, the families of a version by
    parent, profiles (server mode, 25, `q`, `familyId`, `status`), and one profile version.
  - Drafting (`catalogue.manage`): a new catalogue version, add and edit elements
    (`families`, `tracks`, `levels`, `bands`, `grades`), submit, a new profile, a profile
    successor, draft replacement and profile submit.
  - Publication (`catalogue.publish`): catalogue and profile versions.
  - Every request needs entitlement `hcm.job-architecture`. Creation returns 201 and every
    mutation requires an `Idempotency-Key`.
- **Drafts (REQ-JOB-CATALOGUE-002).**
  - A draft successor copies every family, track, level, band and grade of the current
    published version. Child ids derive from the new version and the element code.
  - One draft or review exists per catalogue at a time.
  - Element commands check the draft before writing: a known parent, two-level families,
    one track per kind, unique codes per version and unique sequences per track or band.
    They answer with field errors, and each advances the version revision that the next
    command quotes.
  - Codes and parents never change. Elements are retired, not deleted, and stay visible in
    their version.
  - A published or reviewed version refuses edits with `version-published`.
- **Profiles (REQ-JOB-CATALOGUE-003).**
  - A profile draft references active elements of the current published catalogue version:
    the family, the track, a level of that track, and allowed grades with exactly one
    default.
  - Responsibility and requirement codes are unique. Quantities are non-negative and carry
    a unit.
  - A draft replacement swaps children in one transaction. A successor copies the current
    published version. The body carries no salary or person data, and unknown fields are
    refused.
- **Lifecycle (REQ-JOB-CATALOGUE-004).**
  - Draft → InReview requires families, tracks and bands for catalogues, and the one-default
    rule for profiles. InReview → Published requires an effective date after the current
    version started.
  - Publication stores a SHA-256 source digest of the version's content and closes the
    previous published version the day before as Superseded. It moves the pointer in the
    same transaction, under the catalogue or profile lock.
  - Concurrent publishes serialize: one succeeds and the other gets 409. Existing profiles
    keep referencing the catalogue version they were published against (business rule 18).
- **Audit.** Ten `job-architecture.*` actions record the target version, the reason, the
  changed field names and the lifecycle states, never values.
- **Discovery (DEC-HCM2-020).** The FDD names HR Operations as a reader, but discovery was
  Administration-only. Following DEC-HCM2-017 to DEC-HCM2-019, `access.discovery@6` grants
  `hr-specialist` discovery. The app joins the HR catalogue under Configuration and Service.
- **UI.**
  - Begin column: `HcmDynamicPage` with a native SegmentedButton for the Catalogue and Job
    profiles scopes.
    - Catalogue: the bounded version table with inverted status.
    - Job profiles: the server-mode table with growing, a name or code search, and family
      and status Selects.
  - Mid column, catalogue version: `HcmObjectPage` with Overview, Job families (UI5 Tree),
    Career tracks and levels, and Bands and grades. Tables are client mode, bounded to 200.
  - Mid column, profile version: Overview, Responsibilities, Requirements, Allowed grades
    and Versions (UI5 Timeline).
  - Element edits, draft creation, submission and publication use focused native Dialogs
    with retry keys and discard confirmation. Publication uses a DatePicker.
  - New profiles and profile drafts use `/job-architecture/job-catalogue/profiles/:id/edit`
    (`profiles/new` for creation) with dirty-leave protection:
    - allowed grades are a MultiComboBox, and the default grade a Select limited to them;
    - requirement types and units are Selects, and minimum quantities StepInputs;
    - a draft of an older catalogue version is mapped onto the current version by code.
  - Managers see mutation controls; HR sees none.

## Open points

- Publication moves the current pointer immediately, even for a future effective date.
  Until that date, the previous version's range already ends and the new version is current.
  Consumers that need a date-accurate view read versions by effective range.
- The browser suite publishes a new catalogue version on each run against the persistent
  local database, each effective one day after the last. The version history of a local
  environment therefore grows with every run.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/job-architecture/module/src/lib/job-catalogue.database.spec.ts`: 5 tests pass.
  They cover:
  - reads for David and Toby, family paging by parent, profile search, a refused status
    value, denial for Jim and Michael, and a foreign id 404 (REQ-JOB-CATALOGUE-001);
  - draft creation with copied children, a second draft refused, two-level families, a
    duplicate code, an unknown track kind, a second track of a kind, a duplicate level
    sequence, grade retirement with the revision advancing, a stale revision, and an edit to
    the published version (REQ-JOB-CATALOGUE-002);
  - submission, an edit under review refused, an early effective date refused, two
    concurrent publishes with exactly one success, the predecessor closed the day before,
    existing profiles unchanged, and the audit reason (REQ-JOB-CATALOGUE-004);
  - profile references of another version, a non-current catalogue version, a level of
    another track, two defaults, a retired grade, a negative quantity and a salary field
    refused; replay with the same key; a different payload 409; a duplicate code 409; draft
    replacement, submission, publication, HR denied publish, a successor, and a second
    successor refused (REQ-JOB-CATALOGUE-003, REQ-JOB-CATALOGUE-007);
  - a disabled entitlement, a removed read grant, a disabled account and no DELETE route
    (REQ-JOB-CATALOGUE-005).
- The foundation spec (7 tests), the domain rules (4 tests), the access foundation spec with
  the new discovery grant, and the seed suite with 19 module versions pass.
- The full database suite passes 233 of 234 tests. The one failure is the Linux-only
  `local-document-files.spec.ts`, which fails the same way without this change.
- `apps/hcm/web-e2e/live/job-catalogue.spec.ts`: 4 live browser tests pass, run twice so the
  lifecycle test also started from a catalogue without an open version. They cover:
  - HR reading versions, the family Tree, bands and grades, profiles, allowed grades and the
    Timeline, with no mutation controls;
  - David creating a draft, adding a family, a duplicate code shown and discarded,
    submission and publication;
  - a new profile on its own page, the dirty-leave confirmation on its draft, saving,
    submission and publication;
  - 390/768/1440/2560 widths without horizontal overflow.
    Axe runs throughout.
- Also passing: the `hcm-web` and `hcm-api` production builds, lint for the changed projects,
  `pnpm ux:check-pages`, `pnpm architecture:check`, `pnpm docs:check`,
  `pnpm hcm:catalogue:check`, `pnpm hcm:db:seed:check` and
  `pnpm hcm:app:readiness --app=JOB_CATALOGUE --check`.

Axe excludes only the shared findings recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).

## Reproduction

```bash
pnpm hcm:db:up
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/job-architecture
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts job-catalogue.spec.ts
pnpm hcm:app:readiness --app=JOB_CATALOGUE --check
```
