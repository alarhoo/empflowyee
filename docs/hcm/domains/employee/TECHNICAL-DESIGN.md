# Employee — technical design

Status: complete design for review. Implements the current
[domain model](DOMAIN-MODEL.md), [business rules](BUSINESS-RULES.md),
[profile field policy](PROFILE-FIELD-POLICY.md) and
[logical data model](DATA-MODEL.md) under the
[HCM-2 shared contract](../../tdd/TDD-HCM-2-COMMON.md) and
[physical data model](../../tdd/TDD-HCM-2-DATA-MODEL.md).

<a id="policy"></a>

## POLICY — Profile, records, import, changes, probation and service

- **No Employee aggregate.** Every screen is a projection over Workforce
  Foundation facts plus Employee-owned policy and process records.
- **Field catalogue.** Standard fields and their product defaults are inserted by
  migration from the profile field policy. Any unlisted standard field defaults to
  Optional, NotEditable, Self plus authorized HR, and excluded from directory,
  search, export and notifications.
- **Requiredness contexts.** HCM-2 defines one product context,
  `WorkforceActivation`, used by worker creation and import. Later domains add
  their own named contexts.
- **Tenant policy** may narrow visibility, requiredness, edit mode and
  verification. A CHECK plus application validation reject any widening beyond
  the product ceiling.
- **Custom fields** have one owner scope and data type for life. Sensitive and
  Restricted values require the field-encryption ADR.
- **Self-edit modes.** Direct edits save immediately with audit. ServiceRequest
  fields offer _Request correction_, which opens a prefilled HR request. That
  action is available only once My HR Requests is implemented and discoverable.
  NotEditable fields have no edit control.
- **Excluded standard groups.** Skills, education, work experience, languages and
  self-declared certifications have no HCM-2 tables; they belong to later Skills
  work. Profile photo waits for a governed photo contract. Statutory nominees and
  identification values wait for a named statutory workflow.
- **Records.** HR corrects person facts directly with a reason. Employment and
  assignment facts change only through Employment Changes commands.
- **Worker creation and import** use duplicate detection and human resolution
  under [DEC-HCM2-001](../../roadmap/HCM-2-DECISIONS.md#decisions): name plus
  birth date or work email candidates block creation or commit until HR records a
  resolution per person or row. Validation and
  preview are side-effect free; commit is idempotent per run and row. Invitation
  batches are excluded because production authentication and external delivery
  are deferred.
- **Employment changes** follow [DEC-HCM2-002](../../roadmap/HCM-2-DECISIONS.md#decisions):
  one independent approver for every change type, backdating up to 30 days and
  up to 90 days for corrections. Requesters cannot
  approve their own request; one approver fills one slot. Execution closes and
  opens dated rows through `WorkforceFactsPort`.
- **Probation** follows [DEC-HCM2-003](../../roadmap/HCM-2-DECISIONS.md#decisions):
  one Final review due 14 days before the end date, created automatically when an
  employment enters probation; 1–5 rating; at most one extension of up to 90 days;
  Escalated state 7 days after the due date. Reviewer authority
  is the explicit reviewer on the review record, not the reporting line.
  Decisions never terminate employment.
- **HR service** follows [DEC-HCM2-004](../../roadmap/HCM-2-DECISIONS.md#decisions):
  24x7 clock, first response and resolution targets P1 4h/1d, P2 1d/3d, P3 2d/5d,
  P4 3d/10d, pause while waiting for the employee, reopen within 7 days. The first message is
  the initial description. Internal messages and attachments are deny-by-default
  in every employee-facing serializer, notification and search path.

<a id="data"></a>

## DATA — Owned tables

See the [employee mapping](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping).
Constraints beyond the shared catalogue:

- `profile_field_tenant_policy` and `profile_visibility_preference`: exactly one
  of standard or custom field reference; unique per tenant, field and context.
- `custom_field_value`: `num_nonnulls(person_id, worker_id, employment_id,
assignment_id) = 1` and owner column matching the definition's owner scope via
  deferred trigger.
- `workforce_change_request`: exclusion of overlapping nonterminal requests on the
  same employment and effective date; unique `(tenant_id, idempotency_key)`.
- `workforce_change_approval`: unique `(tenant_id, request_id, approval_slot_code)`
  and unique `(tenant_id, request_id, decided_by_account_id)`; CHECK that the
  approver differs from the requester, enforced by a deferred trigger.
- `employee_import_row`: unique `(tenant_id, run_id, source_row_number)` and
  `(tenant_id, row_idempotency_key)`.
- `probation_review`: unique `(tenant_id, employment_id, sequence_number)`.
- `hr_service_request`: unique `(tenant_id, request_number)`; request numbers come
  from a per-tenant sequence table, formatted `HR-000123`.
- `hr_service_request_message`: runtime INSERT and SELECT only, apart from the
  supersession linkage.

<a id="contract"></a>

## CONTRACT — Runtime-universal DTOs

Library `hcm-employee-contract` at `libs/hcm/contracts/employee`:

- `DirectoryEntryDto` and `DirectoryPersonDto` contain only Organization-visible
  fields. `TeamMemberDto` adds Manager-visible fields. `WorkerRecordDto` holds HR
  fields grouped by section. `MyProfileDto` holds Self fields with per-field
  `editMode`.
- `ProfileFieldDto {code, name, section, sensitivity, ceiling, productDefault,
tenantPolicy|null, custom: boolean}` and `CustomFieldDefinitionDto`.
- `ImportRunDto`, `ImportRowDto {rowNumber, status, matchStatus, proposedAction,
issues: {field, code, severity}[]}`. No raw cell values are returned.
- `EmploymentChangeRequestDto {id, workerId, changeType, effectiveDate, targets,
current, status, approvals, execution, revision}`.
- `ProbationReviewDto`, `ProbationAssessmentDto`, `ProbationDecisionDto`.
- `HrServiceRequestDto` and `HrServiceRequestSelfDto`. The self DTO has no
  internal message, internal attachment, assignee or SLA-internal fields.

<a id="dependencies"></a>

## DEPENDENCIES

- Workforce Foundation read and facts ports; Job Architecture `PositionReadPort`
  for position-linked changes and capacity checks.
- Documents staged storage for import sources and request attachments. Import
  sources need a documents-domain extension accepting CSV and XLSX, kept HR-only
  and outside employee document lists.
- Notifications event registration, audit append and access-control
  authorization from HCM-1.
- Field encryption ADR for sensitive custom values.
- Shared `UX-FP-WIZARD` acceptance before worker creation, import and change wizards.

<a id="test"></a>

## TEST — Domain proof obligations

- Visibility allowlists per viewer relation, including tenant narrowing and
  worker preferences, and rejection of widening.
- Directory and team membership at one instant; team scope changes with
  reporting lines.
- Import: validation without side effects, idempotent commit replay, ambiguous
  matches never auto-merged, parser version and template immutability after
  validation starts.
- Changes: overlap rejection, self-approval rejection, execution rollback on any
  step failure, and worker event emission.
- Probation: extension creates the next review and preserves the prior decision;
  Fail does not end employment.
- HR service: internal content never reaches self endpoints, notifications or
  search; SLA pause and resume per policy.
