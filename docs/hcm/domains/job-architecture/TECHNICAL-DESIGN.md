# Job Architecture — technical design

Status: complete design for review. Implements the current
[domain model](DOMAIN-MODEL.md), [business rules](BUSINESS-RULES.md) and
[logical data model](DATA-MODEL.md) under the
[HCM-2 shared contract](../../tdd/TDD-HCM-2-COMMON.md) and
[physical data model](../../tdd/TDD-HCM-2-DATA-MODEL.md).

<a id="policy"></a>

## POLICY — Versioning, positions and approvals

- **Versions.** Catalogue, job profile and position versions move
  Draft, InReview, Published, then Superseded (or Retired/Cancelled). Only
  Draft versions are editable. Publishing sets the effective range, closes the
  previous published version's range and moves the current pointer in one
  transaction. Corrections create a successor Draft from a published version.
- **Catalogue shape.** Per [DEC-HCM2-005 and DEC-HCM2-006](../../roadmap/HCM-2-DECISIONS.md#decisions):
  one catalogue per organisation; families at most two levels deep; career tracks
  of kind Individual Contributor or Management; levels described by name, sequence
  and scope summary. The initial grade set is four ordered bands (Entry,
  Professional, Senior, Leadership) holding G1–G8, two per band.
- **Profiles.** A profile version belongs to one published catalogue version.
  It references a family, track and level from that version and has at least one
  allowed grade with exactly one default.
- **Positions.** A position stores no person. Its published version fixes profile
  version, allowed grade, designation, legal entity, unit, department, location,
  type, headcount and FTE capacity. Changes go through position change requests
  with an impact preview and one independent approver for every request type
  ([DEC-HCM2-008](../../roadmap/HCM-2-DECISIONS.md#decisions)).
- **Capacity.** Remaining capacity is published capacity minus effective
  assignment occupancy from `PositionOccupancyPort`. When occupancy is incomplete
  the API returns `remaining: null` with `occupancyComplete: false`, never zero.
  Partial FTE is allowed; an assignment exceeding headcount or FTE capacity is
  rejected, and so is one whose occupancy is unknown. There is no overfill
  ([DEC-HCM2-007](../../roadmap/HCM-2-DECISIONS.md#decisions)).
- **Requirements.** Effective position requirements are the profile version's
  requirements with position variances applied (Add, Replace, Strengthen, Waive).
  All four operations are allowed; a request containing a Waive needs an
  independent approver who also holds the waive permission
  ([DEC-HCM2-009](../../roadmap/HCM-2-DECISIONS.md#decisions)). Waiving keeps the
  source requirement visible and needs an encrypted justification.
- **Previews.** An impact preview is valid only while Ready, unexpired (15
  minutes) and matching the current source-version digest. Submission with a
  stale preview returns 409 `preview-stale`.
- **Independence.** Closing or freezing a position never ends an assignment.
- **No compensation data.** No salary, currency, pay rate or benefit value.
- **Deferred.** External framework mappings (DEC-HCM2-010), architecture import
  (DEC-HCM2-011) and reconciliation exceptions need later capabilities.

<a id="data"></a>

## DATA — Owned tables

See the [job architecture mapping](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping).
Constraints beyond the shared catalogue:

- Unique `(tenant_id, job_catalogue_version_id, code)` for families, tracks and
  bands; unique sequence per track, per catalogue version for bands, per band for
  grades.
- Partial unique index `job_profile_grade(tenant_id, job_profile_version_id)
WHERE is_default` plus a deferred constraint trigger requiring one default per
  published profile version.
- Deferred trigger: a position version's grade is allowed by its profile version,
  and all references belong to a compatible catalogue version.
- `position_version` CHECK `headcount_capacity > 0 AND fte_capacity > 0`.
- Relationship cycle prevention runs in the command under the tenant lock using a
  recursive query bounded by the configured depth.

<a id="contract"></a>

## CONTRACT — Runtime-universal DTOs

Library `hcm-job-architecture-contract` at `libs/hcm/contracts/job-architecture`:

- `CatalogueVersionDto {id, catalogueId, versionNumber, status, effectiveFrom,
effectiveTo, changeSummary, revision}` with child `JobFamilyNodeDto`,
  `CareerTrackDto {levels: JobLevelDto[]}`, `JobBandDto {grades: JobGradeDto[]}`.
- `JobProfileSummaryDto` and `JobProfileVersionDto {responsibilities,
requirements, allowedGrades: {gradeId, code, name, isDefault}[]}`.
- `PositionSummaryDto {id, code, name, lifecycleStatus, placement,
headcountCapacity, fteCapacity, occupiedHeadcount|null, occupiedFte|null,
occupancyComplete, revision}`.
- `PositionDetailDto` adds the current version, versions list, relationships and
  open change request reference.
- `PositionChangeRequestDto {id, positionId, requestType, status, items,
preview|null, approvals, revision}`. Reason text is returned only to the
  requester and approvers.
- `EffectiveRequirementDto {code, type, name, proficiency, minimumQuantity,
unit, mandatory, source: "Profile"|"Position", variance|null}`.

<a id="dependencies"></a>

## DEPENDENCIES

- Workforce Foundation `WorkforceReadPort` for structure options and
  `PositionOccupancyPort` for occupancy.
- Field encryption ADR for justifications, reasons and comments.
- Positions require a published catalogue; Position Requirements require the
  position change-request foundation.

<a id="test"></a>

## TEST — Domain proof obligations

- Published immutability trigger and successor correction.
- Effective range exclusion and current pointer consistency after publish.
- Default grade uniqueness and grade-allowed-by-profile checks.
- Capacity with complete, partial and unavailable occupancy.
- Preview staleness after any source change, and approval evidence bound to
  tenant, request, version and state.
- Cycle rejection for relationships and families.
