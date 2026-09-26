# Job architecture catalogue foundation validation

Branch: `codex/hcm-2-job-architecture-catalogue-foundation`, started from the step 10 branch
`codex/hcm-2-my-profile`. It carries the foundation half of delivery step 11 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order): migration `000024`
(planned as `000022`) and the catalogue part of `job.architecture@1`. The Job Catalogue app
follows on `codex/hcm-2-job-catalogue`. No app is released by this step.

## Delivered

- **`000024_job_architecture_catalogue.sql`.**
  - Tenant tables `job_catalogue`, `job_catalogue_version`, `job_family`, `career_track`,
    `job_level`, `job_band`, `job_grade`, `job_profile`, `job_profile_version`,
    `job_profile_responsibility`, `job_profile_requirement`, `job_profile_grade` and
    `job_architecture_command_receipt`, each with forced RLS.
  - One catalogue per tenant (DEC-HCM2-006), one open draft or review per catalogue and per
    profile, and one version per catalogue and per profile per period (exclusion on the
    effective range).
  - Catalogue shape (DEC-HCM2-005):
    - families are at most two levels deep; a trigger derives depth and path from the
      parent, which must be a root of the same version;
    - career track kinds are Individual Contributor or Management, one track each;
    - codes are unique per version, and sequences are unique per track, per version for
      bands and per band for grades.
  - Compatible references (business rule 5): composite foreign keys keep a profile
    version's family, track, level and allowed grades in its catalogue version, and each
    level in its track.
  - A profile version leaving draft needs at least one allowed grade, exactly one default
    (partial unique index plus a deferred trigger) and a published catalogue version
    (business rule 7).
  - Requirement quantities are non-negative and always carry a unit (business rule 8).
  - Published immutability (business rule 2):
    - A trigger lets a published version change only by closing it (Superseded or Retired
      and a first `effective_to`). A version under review never returns to draft.
    - The children of a catalogue or profile version change only while it is a draft.
    - Runtime has no UPDATE on codes, parents or version references of published rows, and
      no DELETE except draft profile responsibilities, requirements and grades.
  - No salary, currency, pay rate or benefit column exists (business rule 21).
- **`job.architecture@1`, catalogue part.**
  - One catalogue published from 2000-01-01:
    - families Sales (Inside Sales, Account Management) and Corporate Services (Human
      Resources, Finance);
    - Individual Contributor levels IC1–IC4 and Management levels M1–M3;
    - bands Entry, Professional, Senior and Leadership holding G1–G8, two per band.
  - Published example profiles Sales Representative, Regional Manager, Human Resources
    Representative and Accountant, with responsibilities, requirements and allowed grades.
  - Versions are inserted as drafts and published the way the commands do. The reset
    removes exactly these rows.
  - Seed modules are immutable once applied, so the position part planned for this module
    arrives with the positions foundation as `job.architecture@2`.
- **Projects.**
  - `hcm-job-architecture-contract`: statuses, track kinds, requirement types and units,
    and the catalogue, family, track, level, band, grade and profile DTOs.
  - `hcm-api-job-architecture-domain`: draft-only change, the lifecycle, successor
    effective dates, two-level families, allowed grades and unique codes.
  - `hcm-api-job-architecture-application`: `CatalogueReader` and the unit of work.
  - `hcm-api-job-architecture-infrastructure`: `KyselyCatalogueReader` and the unit of
    work, which gets the business date from the workforce read port.
  - `hcm-api-job-architecture-module`, imported by the HCM API root.

## Verification

Recorded on 2026-09-26 against disposable PostgreSQL 17.

- `libs/hcm/api/job-architecture/module/src/lib/catalogue-foundation.database.spec.ts`:
  7 tests pass. They cover:
  - the seeded catalogue: pointer, published range, family tree with derived paths, tracks
    with levels, and bands with grades;
  - profile paging, the family subtree, code and name search, the status filter and the
    full version detail, with no compensation data;
  - immutability for the runtime:
    - edits, inserts and deletes on published versions and their children fail with
      `23514`;
    - codes and whole versions cannot be rewritten or deleted (`42501`);
    - closing the published version is the one allowed change, and only once;
  - draft shape: a third family level, a second track of a kind, an unknown kind,
    duplicate sequences and codes, a second open draft, a second catalogue and a grade in
    another version's band;
  - publication: an overlapping range fails with `23P01`, a closed predecessor lets the
    successor publish, skipping review fails, and review never returns to draft;
  - profiles: one default grade, no default, no grades, two defaults, a level of another
    track, a grade of another catalogue version, a draft catalogue, and invalid quantities;
  - tenant isolation and forced RLS on all 13 tables.
- `hcm-api-job-architecture-domain`: 4 rule tests pass.
- `database.integration.spec.ts` lists the new tables. The seed suite passes with 18 module
  versions. `pnpm hcm:db:seed:check` reports the spine projection current.
- Lint for the new projects, the `hcm-api` build and `pnpm architecture:check` pass.

## Reproduction

```bash
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/job-architecture libs/hcm/api/database
pnpm hcm:db:seed:check
```
