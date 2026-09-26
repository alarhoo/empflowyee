# HCM-2 shared technical contract

Status: complete design for review; no implementation or approval claimed.
Every HCM-2 app TDD incorporates this document, the
[HCM-1 shared contract](TDD-HCM-1-LOCAL-COMMON.md) it extends, the
[physical data model](TDD-HCM-2-DATA-MODEL.md) and its owning domain technical
design. Where this document is silent, the HCM-1 contract applies unchanged.
Changing a section invalidates approval hashes in every consuming blueprint.

<a id="api"></a>

## API — Additions to transport rules

- **Routes.** `/api/v1/workforce-foundation/...`, `/api/v1/job-architecture/...`
  and `/api/v1/employee/...`. Self-service paths use `/me/...` inside the owning
  domain. No body or query field carries `tenantId`, an actor override, or an
  own-record subject ID.
- **Dates.** Business dates are inclusive `YYYY-MM-DD` strings. Timestamps are
  UTC ISO-8601. `asOf` query parameters are business dates; when omitted the server
  uses _today_ in the organisation profile's default time zone.
- **Effective-dated DTOs** carry `effectiveFrom`, `effectiveTo` (nullable,
  inclusive) and `recordState` (`Established` or `Incomplete`) where the
  established-record rule applies.
- **Enumerations** are closed string unions in the contract library. Tenant
  lookups are referenced by opaque ID and returned as `{id, code, name, active}`.
- **Option endpoints** (`.../options/...`) return bounded pages for pickers. They
  require the permission of the command that uses them, never a broader read.
- **Error codes** added to the HCM-1 set: `record-incomplete`,
  `effective-date-out-of-range`, `overlapping-effective-period`,
  `approval-required`, `self-approval-forbidden`, `capacity-exceeded`,
  `occupancy-unknown`, `version-published`, `preview-stale`, `field-not-editable`,
  `visibility-ceiling-exceeded`, `duplicate-candidate`.

<a id="auth"></a>

## AUTH — Permission, entitlement and subject scope

Authorization follows the [HCM-1 rule](TDD-HCM-1-LOCAL-COMMON.md#auth): action
permission **and** entitlement **and** subject scope, re-evaluated inside the unit
of work. HCM-2 introduces these subject scopes, resolved by access-control
application code and never by persona names:

| Scope          | Subject set                                                                                                                                                                                                                          | Source of authority                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Self`         | The person, worker and employments linked to the verified account                                                                                                                                                                    | Account linkage                                                    |
| `Organization` | Directory-eligible workers, limited to fields whose effective visibility is Organization                                                                                                                                             | Directory permission plus field policy                             |
| `Team`         | Direct reports: workers with an assignment whose current primary solid line points to one of the actor's current assignments ([DEC-HCM2-015](../roadmap/HCM-2-DECISIONS.md#decisions)), resolved by the Employee `TeamScopeResolver` | Explicit team permission; the reporting line only selects subjects |
| `Assigned`     | Records naming the actor explicitly, such as a probation reviewer or HR service assignee                                                                                                                                             | Explicit assignment on the record                                  |
| `Tenant`       | All tenant workers and records of the domain                                                                                                                                                                                         | Explicit HR or administration permission                           |

A reporting line or position hierarchy never produces a permission on its own.
`Team` exists only for an actor who already holds the team permission, and
membership is recomputed at request time from current effective data.

Field visibility is evaluated **after** row authorization by the Employee
`ProfileFieldVisibilityPort`. The effective visibility of a field for a viewer is
the most restrictive of the product ceiling, the tenant policy, and any allowed
worker preference. The viewer relation is Self, Manager (Team scope), Hr (Tenant
scope with an HR permission) or Organization. DTO serializers are allowlists per
relation. A field the viewer may not see is omitted, never returned as null with
a hidden flag.

<a id="effective"></a>

## EFFECTIVE — Effective-dated commands

- Dated rows are never rewritten. A change closes the current row by setting its
  `effective_to` to the day before the new row's `effective_from` and links
  `superseded_by_id`. Both writes happen in one transaction under the tenant
  advisory lock, and the exclusion constraints are the final guard.
- Future-dated changes to **dated** facts are stored immediately as future rows.
  They need no scheduler. Assignment, reporting line, organisation unit version
  and position version facts are dated.
- **Employment** status, type and probation facts are not dated rows. HCM-2
  applies them only when their effective date is today or earlier. A future-dated
  employment-level change stays `Approved` with an _awaiting effective date_
  indicator. On or after that date, HR runs an explicit **Apply** command, which
  re-validates current facts first. Automatic scheduled execution needs a
  background runtime and stays on the carry-forward watchlist.
- Corrections are explicit command types. They record the corrected row, the
  replacement and a `worker_event` of category Other with a reason.
- Every committed workforce change appends exactly one `worker_event` per
  affected employment with effective date, recorded time and safe before/after
  summaries built from display names and codes, never protected values.

<a id="sensitive"></a>

## SENSITIVE — Personal data handling

- Sensitivity classes follow the product field catalogue: DirectorySafe,
  Personal, Sensitive, Restricted.
- Personal and above never appear in logs, metrics labels, notification payloads,
  audit summaries, cursors, error messages or search projections.
- Restricted values are stored only through the
  [field-encryption ADR](../adr/ADR-HCM-FIELD-ENCRYPTION.md). No HCM-2 slice that
  writes such values starts before that ADR is accepted.
- A read that reveals an emergency-purpose or restricted value appends a
  `sensitive-access` audit event with purpose, actor and subject ID only.
- Personal email and mobile values are stored unverified. HCM-2 shows them as
  _Not verified_ and never uses them for delivery or recovery.
- Directory and search endpoints use only fields whose product ceiling allows
  search. Identifiers are never searchable.

<a id="ports"></a>

## PORTS — Cross-domain collaboration

| Port                                                               | Owner (application project)                                                                | Consumers                                   | Purpose                                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `WorkforceReadPort`                                                | `hcm-api-workforce-foundation-application`                                                 | employee, job-architecture, documents later | As-of projections of structure, people, employments, assignments and reporting lines                                              |
| `WorkforceFactsPort`                                               | `hcm-api-workforce-foundation-application`                                                 | employee                                    | Typed commands: create person/worker/employment/assignment, close/supersede dated rows, set probation facts, append worker events |
| `PositionReadPort`                                                 | `hcm-api-job-architecture-application`                                                     | employee, workforce-foundation              | Effective position placement, capacity and requirement set                                                                        |
| `PositionOccupancyPort`                                            | `hcm-api-workforce-foundation-application`                                                 | job-architecture                            | Effective assignment occupancy per position, with `complete` flag                                                                 |
| `ProfileFieldVisibilityPort`                                       | `hcm-api-employee-application`                                                             | employee                                    | Field visibility for a viewer relation at an instant                                                                              |
| `OrgChartFieldPolicy`                                              | declared in `hcm-api-workforce-foundation-application`, implemented by the employee module | workforce-foundation (org chart)            | Same evaluation, exposed without a workforce-to-employee library dependency                                                       |
| `TeamScopeResolver`                                                | `hcm-api-employee-application`                                                             | employee                                    | Resolve Team subjects under DEC-HCM2-015 from `WorkforceReadPort` reporting data                                                  |
| Authorization, audit append, notification intent, document storage | existing HCM-1 owners                                                                      | all HCM-2 domains                           | Unchanged contracts; access-control never depends on HCM-2 domains                                                                |

Every port accepts the caller's unit-of-work handle, so cross-domain writes commit
together. To avoid Nx cycles, a port consumed by a domain that the owner also
depends on is **declared** in the consuming domain's application project and
**implemented** by the owner. The HCM API application root wires the
implementation during module composition. Concretely, workforce-foundation
declares `OrgChartFieldPolicy`, and the employee module provides it. No library
imports another domain's infrastructure.

<a id="tx"></a>

## TX — Units of work and concurrency

- One tenant advisory lock per mutation, as in HCM-1, then row locks in stable
  order: organisation units, positions, persons, workers, employments,
  assignments, reporting lines, domain requests.
- Mutable aggregates use `expectedRevision`. Commands that change dated facts also
  take the expected revision of each row they close.
- Idempotency receipts live in `workforce_command_receipt`,
  `job_architecture_command_receipt` or `employee_command_receipt`. A cross-domain
  command stores its receipt in the initiating domain only.
- Approval commands re-read policy, subject state and approver eligibility inside
  the lock. Approval evidence records the policy code and version it satisfied.
- Long operations stay synchronous and bounded in HCM-2. Import runs are limited
  to 2,000 data rows per run. Larger volumes need a background runtime, which
  requires a separate ADR.

<a id="events"></a>

## EVENTS — Notifications and audit

New in-app notification event types are registered through the notifications
domain. They use its existing intent contract, templates, rules and preferences,
with plain text and no personal values beyond the recipient's own display context:

| Event type                              | Recipient rule                                      |
| --------------------------------------- | --------------------------------------------------- |
| `employment-change.approval-requested`  | Accounts eligible for the pending approval slot     |
| `employment-change.decided`             | Requesting account                                  |
| `position-change.approval-requested`    | Accounts eligible for the pending approval slot     |
| `position-change.decided`               | Requesting account                                  |
| `probation-review.assigned`             | Assigned reviewer account                           |
| `probation-review.assessment-submitted` | HR account that owns the review                     |
| `hr-request.updated`                    | Requester account for employee-visible updates only |
| `hr-request.assigned`                   | Assigned HR agent account                           |

Notifications are sent only as a side effect of a command. Time-based events such as
probation escalation 7 days after the due date, SLA breaches and automatic closure
are computed as states at read time. Pushing them at the moment they occur needs a
background runtime and stays on the carry-forward watchlist.

Audit uses the existing append-only store. Category `business` for commands,
`sensitive-access` for purpose-bound reveals, `export` for import error-report
downloads. Safe summaries contain IDs, codes, field names and counts, never values.

<a id="ux"></a>

## UX — Floorplans and semantic controls

Business screens are theme-agnostic and follow the
[UI5 feature skill](../../../.ai/skills/hcm-ui5-feature/SKILL.md) and
[data presentation skill](../../../.ai/skills/hcm-data-presentation/SKILL.md).
HCM-2 uses these approved selections:

| Floorplan ID         | Mode     | Implementation                                                                      | Used for                                                         |
| -------------------- | -------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `UX-FP-FCL`          | NATIVE   | UI5 FlexibleColumnLayout; begin column `HcmDynamicPage`, mid column `HcmObjectPage` | Find-and-inspect apps                                            |
| `UX-FP-OBJECT-PAGE`  | COMPOSED | `HcmObjectPage` on its own route                                                    | Single-object self-service (My Profile)                          |
| `UX-FP-DYNAMIC-PAGE` | NATIVE   | `HcmDynamicPage`                                                                    | Bounded catalogue views without rich detail                      |
| `UX-FP-WIZARD`       | NATIVE   | UI5 Wizard on a dedicated route inside native Page                                  | Staged processes: worker creation, import run, employment change |

**Wizard prerequisite.** No HCM implementation of `UX-FP-WIZARD` has passed shared
acceptance yet. Before the first wizard feature ships, the shared UX owner adds a
thin `HcmWizardPage` integration under `libs/hcm/web/ux/floorplans/wizard`. It
needs native step validation, keyboard, responsive and accessibility evidence
recorded in the [floorplan validation record](../ux/floorplans/validation.md).
Features never hand-build step navigation.

Control mapping for HCM-2 data:

| Data                                         | Control                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Work or personal email, telephone            | UI5 Link with `mailto:` or `tel:`                                                    |
| Person reference                             | UI5 Avatar (initials) plus UI5 Link to the permitted detail route                    |
| Employment, request, position, review status | Fundamental `ObjectStatusComponent` with `inverted=true`                             |
| Effective and business dates                 | UI5 DatePicker with `valueFormat="yyyy-MM-dd"`; display through the shared formatter |
| SLA due times                                | Display only through the shared formatter; no editable timestamp in HCM-2            |
| Fixed enumerations                           | UI5 Select                                                                           |
| Workers, positions, units, lookups (large)   | UI5 ComboBox with server filtering through option endpoints                          |
| Multi-select custom field options, grades    | UI5 MultiComboBox                                                                    |
| Yes/no data facts                            | UI5 CheckBox; UI5 Switch only for immediate settings                                 |
| FTE, hours, capacity, quantities             | UI5 StepInput with min, max and precision                                            |
| Long text, reasons, messages                 | UI5 TextArea with maximum length                                                     |
| Hierarchies (reporting lines, families)      | UI5 Tree with `hasChildren` lazy expansion via `ui5ItemToggle`                       |
| Worker event and request history             | UI5 Timeline                                                                         |
| Import source file, request attachments      | UI5 FileUploader                                                                     |
| Sorting                                      | Shared `HcmViewSettings` (UI5 ViewSettingsDialog)                                    |

No `dl/dt/dd` layouts, no native HTML inputs where a UI5 control exists, and no
feature CSS. Object Page display content uses UI5 Form in Edit accessible mode
only for edits. Read-only properties use UI5 Label and Text pairs, avoiding the
known Display Form accessibility limitation.

<a id="native"></a>

## NATIVE — Inspected installed capabilities

Inspected on 2026-09-26 in the installed packages. Fundamental NGX wrappers are
0.64.3 and UI5 Web Components are 2.26.0. Evidence comes from the Angular wrapper
declarations under each package's `types/` directory, not React documentation.

| Import entry                                                                                          | Inspected capability                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout`                                     | FlexibleColumnLayout `layout` and `ui5LayoutChange`                                                  |
| `@fundamental-ngx/ui5-webcomponents-fiori/wizard`, `/wizard-step`                                     | Wizard `contentLayout`, `ui5StepChange`; WizardStep `titleText`, `selected`, `disabled`, `branching` |
| `@fundamental-ngx/ui5-webcomponents-fiori/timeline`, `/timeline-item`                                 | Timeline and TimelineItem                                                                            |
| `@fundamental-ngx/ui5-webcomponents/tree`, `/tree-item`                                               | Tree `ui5ItemToggle`, `ui5ItemClick`, `ui5SelectionChange`; TreeItem `hasChildren`, `expanded`       |
| `@fundamental-ngx/ui5-webcomponents/date-picker`                                                      | DatePicker `valueFormat`, `displayFormat`, `formatPattern`, `minDate`, `maxDate`, `ui5Change`        |
| `@fundamental-ngx/ui5-webcomponents/link`                                                             | Link `href`, `target`, `accessibleName`                                                              |
| `@fundamental-ngx/ui5-webcomponents/combo-box`, `/multi-combo-box`                                    | `filter`, `loading`, `ui5Input`, `ui5Change`, `ui5SelectionChange`                                   |
| `@fundamental-ngx/ui5-webcomponents/avatar`, `/step-input`, `/switch`, `/text-area`, `/file-uploader` | Avatar, StepInput, Switch, TextArea, FileUploader                                                    |
| `@fundamental-ngx/core/object-status`                                                                 | ObjectStatusComponent `status`, `inverted`                                                           |

HCM-1 evidence for Page, DynamicPage, Table, Form, Dialog, Toolbar, MessageStrip
and BusyIndicator remains valid; see the [HCM-1 inspection](TDD-HCM-1-LOCAL-COMMON.md#native).

<a id="test"></a>

## TEST — Additional proof obligations

In addition to the [HCM-1 obligations](TDD-HCM-1-LOCAL-COMMON.md#test):

- Replay `workforce.foundation@1` on a fresh database after all HCM-2 migrations.
- Prove every exclusion constraint with overlapping, adjacent and open-ended ranges.
- Prove established-record CHECKs accept minimal spine rows and reject partial
  groups.
- Prove field-visibility allowlists per viewer relation. Serialize a DTO for each
  relation and assert the absence of every forbidden field.
- Prove Team scope membership changes immediately when a reporting line changes,
  and that a reporting line without the team permission grants nothing.
- Prove self-approval and duplicate-slot approval are rejected.
- Browser tests use Jim, Michael, Toby and David against the seeded database.

<a id="obs"></a>

## OBS — Diagnostics

HCM-1 [observability rules](TDD-HCM-1-LOCAL-COMMON.md#obs) apply. Additionally,
metrics count command outcomes per change type, import row outcomes and SLA
breaches without tenant or person labels.
