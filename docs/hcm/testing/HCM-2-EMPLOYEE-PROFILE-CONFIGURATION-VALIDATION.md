# Employee Profile Configuration validation

Branch: `codex/hcm-2-employee-profile-configuration`, started from the step 9 branch
`codex/hcm-2-employee-profile-foundation`. It carries the first app of delivery step 10 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Employee Profile Configuration (`EMPLOYEE_PROFILE_CONFIGURATION`) is released at
`/employee/employee-profile-configuration` as `UX-FP-FCL` NATIVE, following the approved
[FDD](../apps/employee-profile-configuration/FDD.md) and
[TDD](../apps/employee-profile-configuration/TDD.md).

- **API** (`/api/v1/employee`, new project `hcm-api-employee-transport`):
  - `GET profile-fields` returns the bounded catalogue, and `GET profile-fields/{fieldRef}`
    returns one field with its description, custom definition and options, whether values
    exist, the revision a policy command quotes, and the preview per viewer relation.
  - `PUT …/tenant-policy/WorkforceActivation` narrows a field, and `POST …/reset` returns it
    to the product default. The current row is closed and linked to its successor, never
    rewritten.
  - `POST custom-fields` creates a field (201), `PUT custom-fields/{id}` edits, retires or
    reactivates it, and `POST`/`PUT custom-fields/{id}/options[/{optionId}]` maintain options.
    There is no delete.
  - Reads require `hcm.employee.profile-configuration.read` and writes `…manage`, both with
    entitlement `hcm.employee`, rechecked inside the new employee unit of work.
- **Rules.**
  - A widening attempt returns 400 `visibility-ceiling-exceeded` with the widened attributes
    as field errors; the migration `000022` triggers remain the final guard.
  - A tenant policy command quotes revision 0 while the product default applies.
  - Option commands quote the field's revision, and every option change advances it.
  - Code, owner scope, data type and sensitivity never change. The design allows owner scope
    and data type to change until the first stored value; the runtime grants make them
    immutable from creation, which is the stricter reading.
  - A retired custom field is visible to nobody and disappears from the effective allowlists,
    while its definition, options and values stay readable here.
- **Preview.** The Effective visibility section uses the same evaluator as
  `ProfileFieldVisibilityPort`. Only the employee relation shows an edit mode.
- **Audit.** Commands append `employee.profile-policy-changed`,
  `employee.profile-policy-reset`, `employee.custom-field-created`, `-updated`, `-retired`,
  `-activated`, `-option-added` and `-option-updated` with the target reference and changed
  attribute names only.
- **UI.**
  - Begin column: `HcmDynamicPage` with a Standard/Custom SegmentedButton, code and name
    search, section and sensitivity Selects, and a client-mode table with whole-row
    navigation. Sensitivity and status use inverted ObjectStatus.
  - Mid column: `HcmObjectPage` with Overview (ceiling and product default), Tenant policy,
    Options for select fields, and Effective visibility sections.
  - Dialogs with Signal Forms for tenant policy and reset, custom field edit and retirement,
    and options. The policy Dialog offers only audiences within the ceiling, edit modes up to
    the product default, and keeps product-required fields required.
  - New custom fields use the dedicated route `custom-fields/new`, with an options editor
    for select types.
- **Discovery (DEC-HCM2-019).** The FDD names tenant administrators as readers, but only
  HR could discover the app. `access.discovery@5` grants `tenant-administrator` discovery,
  and the app joins the Tenant Administration catalogue under Reference Data and Policies.
- **Shared code.**
  - `WorkforceReadPort` gains `businessToday()`, so the employee unit of work reads the
    organisation date without importing workforce infrastructure.
  - `organisationToday` moved to its own workforce infrastructure file.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/employee/module/src/lib/profile-configuration.database.spec.ts`: 4 tests
  pass. They cover:
  - the catalogue and preview for Toby and David, and refused query parameters and references
    (REQ-001, REQ-005);
  - narrowing, same-key replay, different-payload 409, stale revision, widening refused with
    field errors, supersession history, reset, repeated reset refused, audit and unknown
    contexts (REQ-002, REQ-008);
  - custom field creation with options, invalid definitions, duplicate code, option add and
    duplicate option code, option retirement, field retirement, no delete, and the custom
    ceiling (REQ-003, REQ-004);
  - denial for Jim, Michael and David's write, a disabled entitlement and a disabled actor, and
    another tenant's field (REQ-006).
- The employee suite, 13 tests, passes. For the full `pnpm hcm:db:test` result, see
  [below](#database-suite).
- `apps/hcm/web-e2e/live/employee-profile-configuration.spec.ts`: 6 live browser tests pass.
  They cover:
  - the catalogue, filters and preview;
  - narrowing with no wider option offered, and reset;
  - a select custom field created on its route, options added and retired, and the field
    retired with no delete;
  - a dirty new field kept until the discard is confirmed;
  - David reading without mutation controls while the API refuses his write;
  - 390/768/1440/2560 widths with axe, and a failed detail load with Retry.
- Also passing: `hcm-web` and `hcm-api` production builds, lint for the changed projects,
  `pnpm ux:check-pages`, `pnpm architecture:check`, `pnpm docs:check`,
  `pnpm hcm:db:seed:check` and `pnpm hcm:app:readiness --app=EMPLOYEE_PROFILE_CONFIGURATION --check`.

Axe excludes only the shared findings recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared):
inverted positive ObjectStatus contrast, Display Form definition-list semantics and the native
FCL separator arrow.

### Database suite
`pnpm hcm:db:test`: 195 of 196 tests across 32 files pass. The one failure is the pre-existing
Linux-only `local-document-files.spec.ts` case. The access snapshot and seed specs count the
new discovery grant and 17 module versions. The Organization Structure browser suite still
passes (6 tests) with the shared draft helpers.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:db:test
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts employee-profile-configuration.spec.ts
pnpm hcm:app:readiness --app=EMPLOYEE_PROFILE_CONFIGURATION --check
```
