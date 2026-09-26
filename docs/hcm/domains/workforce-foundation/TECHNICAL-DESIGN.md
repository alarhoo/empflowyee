# Workforce Foundation — technical design

Status: complete design for review. Implements the current
[domain model](DOMAIN-MODEL.md), [business rules](BUSINESS-RULES.md) and
[logical data model](DATA-MODEL.md) under the
[HCM-2 shared contract](../../tdd/TDD-HCM-2-COMMON.md) and
[physical data model](../../tdd/TDD-HCM-2-DATA-MODEL.md).

<a id="policy"></a>

## POLICY — Domain responsibilities

- Sole writer of structure, people, workers, employments, assignments, reporting
  lines and worker events. Other domains change these facts only through
  `WorkforceFactsPort` commands in their own unit of work.
- Owns tenant lookups (worker types, employment end reasons, worker event types)
  and the read-only product reference catalogues (countries, currencies, genders,
  marital statuses, relationship types, identification types).
- Owns the organisation chart projection over current primary solid reporting
  lines. The chart is informational and never authorizes anything.
- Lookup codes are immutable after first reference. Retiring a lookup hides it
  from new choices but keeps historical meaning and display.
- Structural rows with history are retired or closed, never deleted.
- Duplicate person handling follows [DEC-HCM2-001](../../roadmap/HCM-2-DECISIONS.md#decisions).
  `WorkforceReadPort.duplicateCandidates` returns people whose normalized legal name
  and birth date both match, or whose employment work email matches
  case-insensitively. Normalization ignores case, accents and repeated spaces.
  Callers must record an HR resolution; no automatic merge exists. `mergePerson`
  sets the survivor chain and is allowed only when the duplicate’s worker has no
  established employment.
- Structure (legal entities, unit types, units, departments, designations,
  locations and the organisation profile) is written only through the
  Organization Structure app, per DEC-HCM2-014.
- Identification types are product-maintained; tenants read them only
  (DEC-HCM2-016).

<a id="data"></a>

## DATA — Owned tables

See the [workforce mapping](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Tables
owned: `organisation_profile`, `legal_entity`, `organisation_unit_type`,
`organisation`, `organisation_version`, `department`, `designation`, `location`,
`country`, `currency`, `gender`, `marital_status`, `relationship_type`,
`identification_type`, `worker_type`, `employment_end_reason`,
`worker_event_type`, `person`, `person_address`, `person_contact_point`,
`person_relationship`, `worker`, `employment`, `assignment`, `reporting_line`,
`worker_event`, `workforce_command_receipt`.

Key indexes, all tenant-first:

- `person(tenant_id, search_text gin_trgm_ops)` and
  `person(tenant_id, lower(family_name), lower(given_name), id)`.
- `worker(tenant_id, lower(worker_code))` for exact and prefix search.
- `employment(tenant_id, lower(work_email))` partial where not NULL.
- `assignment(tenant_id, organisation_id, effective_period)`,
  `assignment(tenant_id, position_id, effective_period)`.
- `reporting_line(tenant_id, manager_assignment_id, effective_period)` for
  direct-report expansion, and `(tenant_id, assignment_id, effective_period)`.
- `organisation_version(tenant_id, parent_organisation_id, effective_period)`.

<a id="contract"></a>

## CONTRACT — Runtime-universal DTOs

Library `hcm-workforce-foundation-contract` at
`libs/hcm/contracts/workforce-foundation`:

- `ReferenceItemDto {code, name, active, sortOrder}` for product catalogues.
- `IdentificationTypeDto {code, name, countryCode|null, validationDescription,
uniquePerPerson, requiresMasking, requiredForPayroll, active}`. The raw
  validation regular expression is not serialized; a description is.
- `LookupSetDto {key, label, ownership: "Product"|"Tenant", itemCount}` and
  `LookupValueDto {id, code, name, description, active, sortOrder, attributes,
revision}`. `attributes` is a closed per-set object, for example
  `{statutoryClass, payrollEligible, benefitEligible}` for worker types.
- `OrgChartNodeDto {assignmentId, workerId, displayName, designation|null,
organisationUnit|null, location|null, directReportCount, hasMoreReports,
concurrentContextLabel|null}`.
- `OrgChartPersonDto` adds only fields permitted by `OrgChartFieldPolicy`,
  such as work email and manager node reference.
- `StructureOptionDto {id, code, name, active}` for units, departments,
  designations, locations and legal entities, used by other domains' pickers.

Commands exposed internally through `WorkforceFactsPort`. HTTP in this domain is
limited to structure, lookups, identification types and the org chart:
`createPersonWithWorker`, `correctPersonFacts`, `mergePerson`, `createEmployment`,
`openAssignment`, `supersedeAssignment`, `setReportingLine`,
`applyEmploymentFacts`, `recordWorkerEvent`. Every command takes expected
revisions and returns the new revisions.

<a id="dependencies"></a>

## DEPENDENCIES

- Access-control authorization and audit append from HCM-1.
- `OrgChartFieldPolicy` is implemented by the Employee module and injected at the
  API composition root.
- `PositionOccupancyPort` is implemented here for Job Architecture.
- Structure maintenance is the Organization Structure app, which enters the
  catalogue through the [admission slice](../../roadmap/HCM-2-DESIGN-REVIEW.md#catalogue-admission).

<a id="test"></a>

## TEST — Domain proof obligations

- Version-1 seed replay and minimal-row compatibility on a fresh database.
- Exclusion constraints for unit versions, employments, primary assignments,
  primary reporting lines and primary addresses.
- Unit hierarchy: no cycles, parent type matches the configured type chain,
  materialized path and depth consistency after reparenting.
- Org chart: bounded child pages, roots without managers, concurrent assignment
  labels, closed lines excluded at the instant, and no fields beyond policy.
- Lookups: code immutability after use, retire without history loss, cross-tenant
  negative tests for every table.
