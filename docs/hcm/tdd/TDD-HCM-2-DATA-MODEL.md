# HCM-2 physical data model and migration plan

Status: complete design for review. No migration, seed or Kysely code is created
by this document. It reconciles the current domain authority in
`docs/hcm/domains/{workforce-foundation,job-architecture,employee}` with the
applied database spine, following the
[integration guardrails](../architecture/HCM-2-DATA-MODEL-INTEGRATION.md) and the
[HCM PostgreSQL strategy](../architecture/DATABASE-STRATEGY.md).
[Shared SQL rules](TDD-HCM-1-LOCAL-COMMON.md#sql) continue to apply.

<a id="spine"></a>

## SPINE — Constraints inherited from the applied database

Migrations `000001`–`000016` are applied and immutable. The HCM-2 design must
respect four facts that shape every table below.

1. **Identifiers.** Every tenant table uses opaque `text` IDs with a composite
   `(tenant_id, id)` primary key. The logical `Id int` plus `PublicId uuid` pair in
   the domain documents collapses into this single opaque text `id`. New IDs are
   server-generated UUIDs stored as text. Seed IDs such as
   `dunder-mifflin/worker/jim` stay valid. Contracts expose `id` strings only.
2. **Immutable seeds run after all migrations.** On a fresh database the seed
   runner applies `workforce.foundation@1` after every migration, each module in its
   own transaction. Its original inserts into `organisation`, `location`, `person`,
   `worker`, `employment` and `assignment` must therefore stay valid forever.
   New columns on these tables are nullable or defaulted. No new NOT NULL or CHECK
   may reject the column lists used by that module.
3. **Positional test inserts.** Existing database tests insert into `person` and
   `worker` without column lists. New columns are appended after existing ones and
   have defaults or allow NULL, so trailing values default.
4. **Existing readers.** Documents, identity-access, access-control and runtime code
   read `person.display_name`, `worker.worker_code`, `worker.person_id` and
   `user_account.person_id`. These columns keep their names and meaning.

### Established-record rule

Because the version-1 seed rows lack the richer HCM-2 facts, grouped facts use an
**all-or-none CHECK**. For example an employment row either has none of
`legal_entity_id, employment_type, employment_status, hire_date,
employment_sequence, is_primary_employment` (a _minimal spine row_) or all of them
(an _established row_). HCM-2 commands only ever write established rows.
`workforce.foundation@3` establishes the four existing Dunder Mifflin records.

Projections expose `recordState: "Established" | "Incomplete"` and never guess
missing facts. Commands that need an established row return 409
`record-incomplete`; HR establishes the facts through an Employment Changes
`Correction`. This satisfies "current projections identify contexts explicitly
and never guess" without weakening constraints for new data.

<a id="structure"></a>

## STRUCTURE — Account and HCM ownership of structural facts

Step 1 decision, following [platform data ownership](../../platform/architecture/data-ownership.md):
Account owns commercial and onboarding facts; HCM owns the organisation operating
structure and work locations. Each fact has exactly one writer.

| Fact                                                                                               | Classification            | Writer                               | HCM representation                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Tenant slug, hostnames, lifecycle, display name, branding                                          | Account-owned projection  | Account Portal                       | Existing `tenant`, `tenant_hostname` (read-only in HCM)                                               |
| Commercial entitlements                                                                            | Account-owned projection  | Account Portal                       | Existing `tenant_entitlement`                                                                         |
| Signup facts: industry, website, employee-count estimate, primary/billing/technical contacts       | Account-owned, not needed | Account Portal                       | Not stored in HCM-2                                                                                   |
| Organisation HR defaults: time zone, language, default currency, financial-year start, HQ location | HCM-owned HR master data  | HCM workforce-foundation             | New `organisation_profile` (one row per tenant)                                                       |
| Legal entities and their statutory employer identifiers                                            | HCM-owned HR master data  | HCM workforce-foundation             | New `legal_entity`                                                                                    |
| Organisation unit types, units and their effective hierarchy                                       | HCM-owned HR master data  | HCM workforce-foundation             | Existing `organisation` (stable unit identity) + new `organisation_unit_type`, `organisation_version` |
| Departments, designations                                                                          | HCM-owned HR master data  | HCM workforce-foundation             | New `department`, `designation`                                                                       |
| Work locations                                                                                     | HCM-owned HR master data  | HCM workforce-foundation             | Existing `location`, evolved                                                                          |
| Initial organisation defaults at tenant provisioning                                               | Synchronized contract     | Account supplies once; HCM then owns | Deferred provisioning handoff; see carry-forward                                                      |

The organisation display name shown in HCM remains the Account-owned
`tenant.display_name`. HCM does not store a competing trading name. Legal names
belong to legal entities.

Per [DEC-HCM2-014](../roadmap/HCM-2-DECISIONS.md#decisions), the new Organization
Structure app is the only HCM writer of these facts. Other apps select existing
structure through option endpoints and never create it.

<a id="mapping"></a>

## MAPPING — Logical entities to physical tables

Physical names keep the repository's British `organisation` spelling. Global
product reference tables have no `tenant_id`; their absence is deliberate.

### Workforce Foundation

| Logical entity                                   | Physical table                                              | Treatment          | Notes                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization                                     | `organisation_profile`                                      | New                | PK `tenant_id`; one per tenant by construction. No `organization_id` columns elsewhere because tenant and organisation are 1:1.                                                                                                                                                                           |
| LegalEntity                                      | `legal_entity`                                              | New                | Code unique per tenant; statutory identifiers stored plain because they are public employer registrations; `operations_closed_on` instead of delete.                                                                                                                                                      |
| GoodsAndServicesTaxRegistration                  | —                                                           | Deferred           | No HCM-2 app uses it. Added with payroll/statutory work.                                                                                                                                                                                                                                                  |
| OrgUnitType                                      | `organisation_unit_type`                                    | New                | Parent-type chain, `is_legal_entity_bearing`, `allow_multiple_per_parent`.                                                                                                                                                                                                                                |
| OrgUnit                                          | `organisation`                                              | Evolved            | Existing rows are stable unit identities. Adds `is_active`, `superseded_by_id`, `revision`, timestamps. Legacy `parent_id` is retained only for version-1 seed compatibility and is never read by HCM-2; hierarchy comes from `organisation_version`.                                                     |
| OrgUnitVersion                                   | `organisation_version`                                      | New                | Effective hierarchy with exclusion constraint per unit; `materialized_path` and `depth` maintained by the owning command; root has NULL parent.                                                                                                                                                           |
| Location                                         | `location`                                                  | Evolved            | Adds code, type, address, geo, virtual flag, active, revision. `organisation_id` keeps meaning _owning unit_. `country_code` gains an FK to `country`.                                                                                                                                                    |
| Department                                       | `department`                                                | New                | Self-parent, head worker, cost centre, target headcount.                                                                                                                                                                                                                                                  |
| Designation                                      | `designation`                                               | New                | Title only; `sort_order` is display seniority, never a grade.                                                                                                                                                                                                                                             |
| Country, Currency                                | `country`, `currency`                                       | New global         | Keyed by ISO code; rows inserted by the migration as product metadata.                                                                                                                                                                                                                                    |
| IndustryType                                     | —                                                           | Not stored         | Account-owned signup fact.                                                                                                                                                                                                                                                                                |
| Gender, MaritalStatus, RelationshipType          | `gender`, `marital_status`, `relationship_type`             | New global         | Keyed by `code`; product-owned, retired never deleted.                                                                                                                                                                                                                                                    |
| IdentificationType                               | `identification_type`                                       | New global         | Keyed by `code`; product-maintained only, tenants read (DEC-HCM2-016).                                                                                                                                                                                                                                    |
| Person                                           | `person`                                                    | Evolved            | `given_name`/`family_name`/`display_name` keep meaning (first/last/rendered name). Adds middle, preferred, former names, birth date, gender, marital status, nationality, blood group, deceased date, active, merge chain, `search_text`, revision, timestamps. Photo deferred.                           |
| PersonAddress                                    | `person_address`                                            | New                | Exclusion constraint: one primary per person per period.                                                                                                                                                                                                                                                  |
| PersonContactPoint                               | `person_contact_point`                                      | New                | Unverified until a verification channel exists; see carry-forward.                                                                                                                                                                                                                                        |
| PersonIdentification                             | —                                                           | Deferred           | Needs field encryption and a named statutory workflow; no HCM-2 app writes identifier values. Its use for duplicate detection depends on DEC-HCM2-001.                                                                                                                                                    |
| PersonRelationship                               | `person_relationship`                                       | New                | Emergency contacts and dependants in HCM-2; statutory nominee columns exist but no HCM-2 app writes them.                                                                                                                                                                                                 |
| Worker                                           | `worker`                                                    | Evolved            | `worker_code` is WorkerNumber. Adds worker type, engagement dates, `is_currently_engaged`, revision, timestamps. Existing unique `(tenant_id, person_id)` enforces one worker per person.                                                                                                                 |
| Employment                                       | `employment`                                                | Evolved            | Adds the established group plus work email, dates, probation, notice, exit and rehire facts, `employment_period` and revision. Legacy `organisation_id` keeps meaning _legal-entity-bearing unit_.                                                                                                        |
| Assignment                                       | `assignment`                                                | Evolved            | `organisation_id` is OrgUnitId, `location_id` is WorkLocationId. Legacy `job_title` becomes the immutable title snapshot of that dated row. Adds department, designation, **position**, work mode, FTE, hours, primary flag, billable, cost centre, effective dates, supersession, change note, revision. |
| ReportingLine                                    | `reporting_line`                                            | New                | Assignment to manager assignment; one primary solid line per assignment per period.                                                                                                                                                                                                                       |
| WorkerEvent                                      | `worker_event`                                              | New                | Append-only; runtime has INSERT and SELECT only.                                                                                                                                                                                                                                                          |
| WorkerType, EmploymentEndReason, WorkerEventType | `worker_type`, `employment_end_reason`, `worker_event_type` | New tenant lookups | Code unique per tenant and immutable after first use.                                                                                                                                                                                                                                                     |
| —                                                | `workforce_command_receipt`                                 | New                | Idempotency receipts, same shape as existing receipt tables.                                                                                                                                                                                                                                              |

### Job Architecture

| Logical entity                                                                                           | Physical table                           | Treatment | Notes                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JobCatalogue, JobCatalogueVersion                                                                        | `job_catalogue`, `job_catalogue_version` | New       | Published versions immutable via trigger; exclusion on effective range per catalogue. One catalogue per tenant, enforced by a unique index on `tenant_id` (DEC-HCM2-006). |
| JobFamily, CareerTrack, JobLevel, JobBand, JobGrade                                                      | same names, snake_case                   | New       | Children of one catalogue version; unique sequence per parent; family `depth <= 2` and `career_track.kind IN (IndividualContributor, Management)` (DEC-HCM2-005).         |
| JobProfile, JobProfileVersion, JobProfileResponsibility, JobProfileRequirement, JobProfileGrade          | same names                               | New       | Exactly one default grade per version (partial unique index plus deferred check).                                                                                         |
| Position, PositionVersion                                                                                | `position`, `position_version`           | New       | Position stores no person. Capacity columns `headcount_capacity` integer and `fte_capacity numeric(6,2)`.                                                                 |
| PositionRequirement                                                                                      | `position_requirement`                   | New       | Variance rows; encrypted justification per the field-encryption prerequisite.                                                                                             |
| PositionRelationship                                                                                     | `position_relationship`                  | New       | Cycle prevention in the owning command under the tenant lock.                                                                                                             |
| PositionChangeRequest, PositionChangeItem, PositionApprovalCase, PositionDecision, PositionImpactPreview | same names                               | New       | Approval evidence is domain-local; workflow reference columns stay NULL until a workflow engine exists.                                                                   |
| JobArchitectureImportBatch/Row/Issue                                                                     | —                                        | Deferred  | DEC-HCM2-011.                                                                                                                                                             |
| JobArchitectureReconciliationException                                                                   | —                                        | Deferred  | Needs a background runtime; see carry-forward.                                                                                                                            |
| —                                                                                                        | `job_architecture_command_receipt`       | New       | Idempotency receipts.                                                                                                                                                     |

### Employee

| Logical entity                                                                     | Physical table                                                                                                                                | Treatment  | Notes                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| WorkforceProfileFieldDefinition, WorkforceProfileFieldDefaultPolicy                | `profile_field_definition`, `profile_field_default_policy`                                                                                    | New global | Product-owned rows inserted by migration from [the field policy](../domains/employee/PROFILE-FIELD-POLICY.md).      |
| TenantWorkforceProfileFieldPolicy                                                  | `profile_field_tenant_policy`                                                                                                                 | New        | Exactly one of standard or custom field reference. CHECK prevents widening beyond the ceiling.                      |
| WorkerProfileVisibilityPreference                                                  | `profile_visibility_preference`                                                                                                               | New        | Narrow or allowed opt-in only.                                                                                      |
| WorkforceCustomFieldDefinition/Option/Value/ValueOption                            | `custom_field_definition`, `custom_field_option`, `custom_field_value`, `custom_field_value_option`                                           | New        | Exactly-one-owner CHECK across person/worker/employment/assignment. Sensitive values use the encrypted column only. |
| EmployeeImportTemplate/Column, EmployeeImportRun/Row/Issue                         | `employee_import_template`, `employee_import_template_column`, `employee_import_run`, `employee_import_row`, `employee_import_issue`          | New        | Rows hold digests, match and result references, never raw source rows.                                              |
| WorkforceInvitationBatch, WorkforceInvitation                                      | —                                                                                                                                             | Deferred   | Needs production authentication and external delivery.                                                              |
| WorkforceChangeRequest, WorkforceChangeApproval, WorkforceChangeExecutionStep      | `workforce_change_request`, `workforce_change_approval`, `workforce_change_execution_step`                                                    | New        | Adds `target_position_id`, absent from the logical model, to integrate Assignment with Position.                    |
| ProbationReview, ProbationAssessment, ProbationDecision                            | same names                                                                                                                                    | New        | Decision writes employment probation facts in the same unit of work.                                                |
| HrServiceTeam, HrServiceTeamMembership, HrServiceRequestType, HrServiceLevelPolicy | `hr_service_team`, `hr_service_team_membership`, `hr_service_request_type`, `hr_service_level_policy`                                         | New        | Membership is routing, never authorization.                                                                         |
| HrServiceRequest, Message, Attachment, Assignment, LevelTarget                     | `hr_service_request`, `hr_service_request_message`, `hr_service_request_attachment`, `hr_service_request_assignee`, `hr_service_level_target` | New        | _Assignee_ avoids confusion with workforce Assignment. Attachments reference `document_blob`.                       |
| —                                                                                  | `employee_command_receipt`                                                                                                                    | New        | Idempotency receipts.                                                                                               |

<a id="rules"></a>

## RULES — Constraint catalogue

- **Tenant ownership.** Every tenant table has `tenant_id`, composite PK and
  same-tenant composite foreign keys. ENABLE and FORCE RLS with USING and WITH
  CHECK on `hcm.current_tenant_id()` in the creating migration.
- **Effective dating.** API dates are inclusive `YYYY-MM-DD`. Each dated table
  stores `effective_from date NOT NULL` and `effective_to date NULL` and a stored
  generated `effective_period daterange` equal to
  `daterange(effective_from, effective_to + 1, '[)')`. Critical non-overlap
  invariants use `EXCLUDE USING gist`. Migration `000017` runs
  `CREATE EXTENSION IF NOT EXISTS btree_gist`; it is a trusted extension on
  PostgreSQL 17 and installable by the database owner `hcm_migrator`.
- **Critical exclusions.**
  - One version per organisation unit per period.
  - One version per position, job profile and catalogue per period.
  - One primary address per person per period.
  - No overlapping employment for the same worker and legal entity.
  - One primary employment per worker per period.
  - One primary assignment per employment per period.
  - One primary solid reporting line per assignment per period.
- **Supersession, not rewrite.** Runtime has no UPDATE on dated business columns
  of `assignment`, `organisation_version`, `reporting_line`, or published
  architecture versions. It may set only `effective_to`, `superseded_by_id`,
  `revision` and `updated_*` when closing a row. Published version immutability is
  also enforced by a BEFORE UPDATE trigger.
- **Append-only evidence.** `worker_event`, approval, decision, assessment,
  execution-step history and message rows grant INSERT and SELECT only; the one
  permitted update is `superseded_*` linkage where the model defines it.
- **No hard delete.** No runtime DELETE grant on any HCM-2 business table except
  draft child rows of an unpublished architecture version.
- **Sensitive columns.** Encrypted columns are `bytea` ciphertext plus key version
  under the [field-encryption ADR](../adr/ADR-HCM-FIELD-ENCRYPTION.md). No index,
  search projection or audit summary may contain their plaintext.
- **Search.** `person.search_text` is a stored normalized lower-case, accent-free
  concatenation of given, preferred and family names, maintained by the writer.
  Index with `pg_trgm` GIN (trusted extension, created in `000017`) plus a
  tenant-first btree for prefix search. It never contains identifiers.
- **Revisions.** Every mutable aggregate has `revision integer NOT NULL DEFAULT 1
CHECK (revision > 0)` and `created_at/updated_at timestamptz`,
  `created_by_account_id/updated_by_account_id` referencing `user_account`.

<a id="migrations"></a>

## MIGRATIONS — Ordered forward migrations

File numbers are assigned in merge order; the sequence and ownership are
normative. Each migration is delivered in the branch of its owning domain slice.

| Order | Proposed file                              | Owner                | Content                                                                                                                                                                                               |
| ----- | ------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `000017_workforce_reference_data.sql`      | workforce-foundation | `btree_gist` and `pg_trgm` extensions; global `country`, `currency`, `gender`, `marital_status`, `relationship_type`, `identification_type` with product rows; FK `location.country_code -> country`. |
| 2     | `000018_workforce_structure.sql`           | workforce-foundation | `organisation_profile`, `legal_entity`, `organisation_unit_type`, `organisation` evolution, `organisation_version`, `department`, `designation`, `location` evolution, `workforce_command_receipt`.   |
| 3     | `000019_workforce_people.sql`              | workforce-foundation | Tenant lookups; `person` and `worker` evolution; `person_address`, `person_contact_point`, `person_relationship`.                                                                                     |
| 4     | `000020_workforce_employment.sql`          | workforce-foundation | `employment` and `assignment` evolution, `reporting_line`, `worker_event`, exclusion constraints, established-record CHECKs.                                                                          |
| 5     | `000021_employee_profile_policy.sql`       | employee             | Field definitions and defaults, tenant policy, preferences, custom fields, `employee_command_receipt`.                                                                                                |
| 6     | `000022_job_architecture_catalogue.sql`    | job-architecture     | Catalogue, versions, families, tracks, levels, bands, grades, profiles and children, receipts.                                                                                                        |
| 7     | `000023_job_architecture_positions.sql`    | job-architecture     | Positions, versions, requirements, relationships, change requests, items, approval cases, decisions, previews.                                                                                        |
| 8     | `000024_workforce_assignment_position.sql` | workforce-foundation | Nullable `assignment.position_id` with same-tenant FK to `position`; occupancy index.                                                                                                                 |
| 9     | `000025_employee_workforce_changes.sql`    | employee             | Change requests, approvals, execution steps.                                                                                                                                                          |
| 10    | `000026_employee_import.sql`               | employee             | Templates, columns, runs, rows, issues.                                                                                                                                                               |
| 11    | `000027_employee_probation.sql`            | employee             | Reviews, assessments, decisions.                                                                                                                                                                      |
| 12    | `000028_employee_hr_service.sql`           | employee             | Teams, memberships, types, level policies, requests, messages, attachments, assignees, targets.                                                                                                       |

Business permission definitions are tenant data, not migration content, as in
HCM-1. Migration acceptance follows the [shared SQL contract](TDD-HCM-1-LOCAL-COMMON.md#sql):
upgrade a populated HCM-1 copy, replay the version-1 seeds on a fresh database,
apply twice without drift, and run negative RLS tests as `hcm_runtime`.

<a id="seeds"></a>

## SEEDS — Versioned Dunder Mifflin modules

| Module                   | Depends on                               | Content                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workforce.foundation@2` | `workforce.foundation@1`, migrations 1–2 | Organisation profile (America/New_York, en-US, USD, January financial year); legal entity _Dunder Mifflin Paper Company, Inc._; unit types Company then Branch; versions for the three existing units; departments Sales, Accounting, Human Resources, Management; designations.                                                                                                                                 |
| `workforce.foundation@3` | `workforce.foundation@2`, migrations 3–4 | Tenant lookups; establishes the four existing people, employments and assignments; adds fictional workers without accounts (for example Dwight Schrute, Pam Beesly, Angela Martin, Oscar Martinez) so directory, org chart and team scope have meaningful data; reporting lines Jim, Dwight and Pam to Michael, Michael and Toby to David.                                                                       |
| `employee.profile@1`     | `workforce.foundation@3`, migration 5    | Tenant field policy rows only where Dunder Mifflin narrows the product baseline; no fictional personal data beyond what the profile screens need.                                                                                                                                                                                                                                                                |
| `job.architecture@1`     | `workforce.foundation@3`, migrations 6–8 | One published catalogue: families Sales (Inside Sales, Account Management) and Corporate Services (Human Resources, Finance); tracks Individual Contributor (IC1–IC4) and Management (M1–M3); bands Entry, Professional, Senior and Leadership with grades G1–G8. Example profiles and positions for Scranton sales and HR, sized so existing assignments fit capacity; links existing assignments to positions. |
| `employee.operations@1`  | the above, migrations 9–12               | A fictional new hire in probation with its Final review due 14 days before the end date and Michael as reviewer; one HR service team with Toby, request types including personal-data correction, and service level policy `standard@1` with the approved 24x7 targets. No fabricated historical approvals, decisions or service conversations.                                                                  |
| `access.hcm2@1`          | `access.documents@3`                     | Business permission definitions and persona grants from the [HCM-2 permission matrix](HCM-2-PERMISSION-MATRIX.md), plus the Organization Structure discovery permission and grants delivered with its catalogue admission.                                                                                                                                                                                       |

Seeds never insert fabricated audit success, notification history or sensitive
identifier values. Each module has a reset script, like HCM-1 modules.

<a id="kysely"></a>

## KYSELY — Typed query ownership

Kysely table interfaces live in each owning domain's `type:infrastructure` project
and mirror the applied SQL. They are not exported to other domains.

| Tables                                                                                  | Kysely owner                                  | Other domains access through                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Structure, reference data, people, workers, employments, assignments, reporting, events | `hcm-api-workforce-foundation-infrastructure` | `WorkforceReadPort` and `WorkforceFactsPort` in `hcm-api-workforce-foundation-application`       |
| Catalogue, profiles, positions and their workflow tables                                | `hcm-api-job-architecture-infrastructure`     | `PositionReadPort` (capacity, placement, requirements) in `hcm-api-job-architecture-application` |
| Profile policy, custom fields, import, changes, probation, HR service                   | `hcm-api-employee-infrastructure`             | `ProfileFieldVisibilityPort` in `hcm-api-employee-application`                                   |

Cross-domain calls receive the caller's unit of work so they run in the same
transaction. Existing HCM-1 readers of the spine (documents worker options,
identity person options, runtime persona context) keep their current SQL; they
read only columns whose meaning is unchanged.

<a id="rollback"></a>

## ROLLBACK — Operational recovery

All HCM-2 migrations are additive except FKs and CHECKs on new columns. Rollback
follows the [shared rule](TDD-HCM-1-LOCAL-COMMON.md#sql): stop exposing routes and
commands, deploy a schema-compatible application revision and keep additive data.
No down migrations, dropped tables or deleted seed rows.
