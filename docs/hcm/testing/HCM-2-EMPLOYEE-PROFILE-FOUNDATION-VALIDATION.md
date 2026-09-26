# Employee profile foundation validation

Branch: `codex/hcm-2-employee-profile-foundation`, started from the step 8 branch
`codex/hcm-2-lookup-values`. It carries delivery step 9 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order): migration
`000022` (planned as `000021`), `ProfileFieldVisibilityPort`, `OrgChartFieldPolicy`,
`TeamScopeResolver` and `employee.profile@1`. No app is released by this step.

## Delivered

- **`000022_employee_profile_policy.sql`.**
  - Global product tables `profile_field_definition` and `profile_field_default_policy`,
    with 36 standard fields inserted from the
    [profile field policy](../domains/employee/PROFILE-FIELD-POLICY.md). Runtime has
    SELECT only.
  - Tenant tables `profile_field_tenant_policy`, `profile_visibility_preference`,
    `custom_field_definition`, `custom_field_option`, `custom_field_value`,
    `custom_field_value_option` and `employee_command_receipt`, each with forced RLS.
  - Policy rows are closed, never rewritten. Runtime may update only
    `effective_until_at`, `superseded_by_id`, `revision` and `updated_*`, and one current
    row per tenant, field and context is enforced by a partial unique index.
  - Custom field codes, owner scope, data type and sensitivity have no runtime UPDATE
    grant. Custom field values have no runtime write grant yet; the consuming apps add
    theirs.
  - Triggers are the final guard:
    - a tenant policy may not widen the visibility ceiling, the product edit mode or the
      product preference allowance, may not make a product-required field optional, and
      may not require verification;
    - a worker preference exists only where the effective policy allows one;
    - a deferred trigger keeps each custom value on its definition's owner, in its data
      type's column, and in ciphertext only for Sensitive and Restricted fields.
  - An exclusion constraint allows one value per field and owner per period.
- **Policy vocabulary** (`hcm-employee-contract`):
  - Visibility audiences are cumulative, narrowest first: Self < Hr < Manager <
    Organization. A field visible at Manager is also visible to HR and to the worker.
  - A custom field's ceiling derives from its sensitivity: DirectorySafe to
    Organization, Personal to Manager, Sensitive and Restricted to HR. Only DirectorySafe
    fields are searchable.
  - A field whose effective requiredness is Hidden is not collected for the tenant and is
    visible to nobody.
- **Ports.**
  - `ProfileFieldVisibilityPort` (`hcm-api-employee-application`), with a
    policy-backed implementation. It returns relation allowlists before and after worker
    preferences, per-worker effective visibility, and the searchable fields of a
    relation. The effective visibility is the most restrictive of the ceiling, the
    product default, the tenant policy and an allowed worker preference.
  - `TeamScopeResolver` resolves direct reports under DEC-HCM2-015 through
    `WorkforceReadPort`, which gains `accountWorker(accountId)`.
  - `OrgChartFieldPolicy` and its `OrgChartFieldPolicyBinder` are declared in
    `hcm-api-workforce-foundation-application` and implemented by the employee
    infrastructure. The global `HcmEmployeeModule`, imported by the HCM API root, provides
    the binder and `EmployeePortBinder`, so workforce-foundation never depends on employee
    libraries.
- **`employee.profile@1`.** Dunder Mifflin narrows one field: `work-mode` is visible to
  managers and HR rather than the whole organisation. No personal data is seeded.

### Standard field catalogue

The design names the field groups but not their codes, so this step authored them. They
are the stable identifiers used by `fieldRef` (`standard:<code>`) in the step 10 apps.

| Section    | Fields                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity   | `display-name`, `legal-given-name`, `legal-middle-name`, `legal-family-name`, `preferred-name`, `former-name`, `worker-number`                                          |
| Personal   | `birth-date`, `gender`, `marital-status`, `nationality`, `blood-group`                                                                                                  |
| Contact    | `work-email`, `personal-email`, `mobile-phone`, `home-address`, `emergency-contacts`, `family-members`                                                                  |
| Employment | `legal-entity`, `worker-type`, `employment-type`, `employment-status`, `hire-date`, `continuous-service-start-date`, `probation`, `notice-period`, `rehire-eligibility` |
| Assignment | `organisation-unit`, `department`, `designation`, `location`, `manager`, `work-mode`, `full-time-equivalent`, `standard-hours`, `cost-centre`                           |

Groups the design excludes from HCM-2 have no definition: skills, education, work
experience, languages, self-declared certifications, profile photo, statutory nominees and
identification values. Legal name parts are HR-visible; the organisation sees the display
name. Only `display-name`, `preferred-name`, `worker-number` and `work-email` are
searchable, as the policy's directory ceiling allows.

## Verification

Recorded on 2026-09-26.

- `libs/hcm/api/employee/domain/src/lib/profile-visibility.spec.ts`: 3 unit tests pass
  for audience ordering, effective visibility and refusal of widening.
- `libs/hcm/api/employee/module/src/lib/profile-policy.database.spec.ts`: 6 tests pass,
  run as the restricted runtime role. They cover:
  - the catalogue with Dunder Mifflin's narrowing, runtime write grants, fixed custom
    field columns, and forced RLS;
  - allowlists for Organization, Manager, HR and Self, and the searchable fields;
  - an allowed preference applied per worker and in the org-chart field policy, and
    database refusal of widening visibility, edit mode or requiredness, requiring
    verification, a second current policy and a disallowed preference;
  - custom fields within their sensitivity ceiling, no runtime value writes, and the
    deferred value shape rules and overlap exclusion;
  - team scope for Michael, David and Jim, before and after the seeded placements;
  - no policy or custom field leaking between tenants.
- `pnpm hcm:db:test`: 191 of 192 tests across 31 files pass. The one failure is the
  pre-existing Linux-only `local-document-files.spec.ts` case. The table inventory spec now
  lists the nine new tables, and the seed spec counts 16 module versions.
- The local database applied `000022` and `employee.profile@1` through `pnpm hcm:db:up`,
  and the API started with `HcmEmployeeModule` wired at its root.
- Also passing: the `hcm-api` production build, lint for the new and changed projects,
  and `pnpm architecture:check`.

## Open points

- **Values and editors.** Custom field values, tenant policy commands and preferences are
  written by Employee Profile Configuration and My Profile in step 10, which add the
  runtime grants and audited commands they need.
- **Org chart wiring.** The org chart use cases inject `OrgChartFieldPolicyBinder` when
  that app is built in step 10; the provider already exists.
