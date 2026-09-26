# My Profile validation

Branch: `codex/hcm-2-my-profile`, started from `codex/hcm-2-team-directory`. It carries the fifth
and last app of delivery step 10 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

My Profile (`MY_PROFILE`) is released at `/employee/my-profile` as `UX-FP-OBJECT-PAGE`
COMPOSED, following the approved [FDD](../apps/my-profile/FDD.md) and
[TDD](../apps/my-profile/TDD.md).

- **API** (`/api/v1/employee/me/profile`):
  - `GET` returns `MyProfileDto`. `GET options/{relationship-types|genders}` returns reference
    items. Both require `hcm.employee.profile.self.read`.
  - `PUT personal`, `POST contact-points`, `PUT contact-points/{id}`,
    `POST contact-points/{id}/deactivate`, `POST relationships`, `PUT relationships/{id}`,
    `POST relationships/{id}/deactivate`, `PUT custom-fields/{fieldId}` and
    `PUT visibility/{fieldRef}` return the refreshed `MyProfileDto`. They require
    `hcm.employee.profile.self.manage` and an `Idempotency-Key`. Creation returns 201.
  - Every request needs entitlement `hcm.employee`. No body, path or query value names a
    tenant or the subject: the worker is resolved from the verified account.
- **Migration `000023_employee_self_service.sql`.** It grants the runtime `UPDATE (blood_group)`
  on `person`, INSERT and the value, period and revision columns on `custom_field_value`, and
  INSERT and DELETE on `custom_field_value_option`. The step 9 grant assertions now expect
  these writes, and a runtime value that breaks the deferred shape rule still fails with
  `23514`.
- **Self allowlist (REQ-001, REQ-005).**
  - Every active field whose effective visibility is not hidden is returned with its edit
    mode, effective visibility and, where the policy allows one, the worker's preference and
    the audiences still open to it.
  - Contacts, addresses and relationships appear only while their field is visible; a Hidden
    field and its collection disappear.
  - Employment and assignment facts are read-only, with concurrent employments and
    assignments listed separately.
  - An account whose person is not a worker receives `linked: false` with an explanation
    instead of an error.
- **Commands (REQ-002, REQ-008).**
  - Edit mode is re-evaluated in every command. A field that is not `Direct` is refused with
    `field-not-editable`.
  - Workforce facts change only through the new `WorkforceProfilePort` in the same
    transaction:
    - The preferred name and blood group update the person revision. The display name and
      search text follow the preferred name.
    - Personal email and mobile numbers are saved unverified. The first active one of a type
      is primary, one primary per type is kept, and removing the primary promotes the oldest
      remaining one.
    - Emergency contacts need a contact number and a priority that is unique per person.
      Dependants are allowed only for relationship types eligible as dependants. At most 20
      entries are kept.
    - Removal deactivates rows; history is kept.
  - Direct custom values are owned by the employee domain. A value recorded today is replaced
    in place; an older value is closed the day before and linked to its successor. Person and
    Worker fields belong to the person or worker. Employment and Assignment fields belong to
    the primary employment and assignment.
  - Sensitive and Restricted custom values are refused with `encryption-unavailable` until the
    field cipher of step 3 exists, and their stored values are never returned.
  - Each command writes one `employee.my-profile-changed` or
    `employee.visibility-preference-changed` audit event naming field identifiers only, plus
    one idempotency receipt. A replay returns the first response; another payload with the
    same key is 409.
- **Preferences (REQ-004).** A preference can only narrow. Its options stop at the visibility
  the policy gives without a preference, and a wider choice is refused. Clearing a preference
  closes the row, so the field returns to the policy.
- **Corrections (REQ-003).** My HR Requests is not built, so `correctionsAvailable` is `false`
  and no correction control is rendered (DEC-HCM2-004).
- **UI.**
  - A composed `HcmObjectPage` titled with the display name, with Avatar initials and the
    primary designation. Its sections are Overview, Personal, Contact, Addresses, Emergency
    contacts and family, Employment, Additional information and Privacy.
  - Each editable item opens a focused native Dialog with a stable retry key and a discard
    confirmation.
  - Contacts are `mailto:`/`tel:` Links with an inverted _Not verified_ ObjectStatus.
    Relationships are a bounded client table with Edit and Remove row actions.
  - Controls follow the data type: DatePicker for birth dates, Select for relationship type,
    gender, blood group and preferences, CheckBox for flags, and StepInput for priority. Custom
    values use the control of their data type, and a MultiComboBox for multi-select.

## Open points

- The FDD illustrates REQ-004 with a narrowed work email. The product default of
  `work-email` does not allow a worker preference, and a tenant cannot widen it, so the
  mechanism is proven with the preferred name, the one standard field whose default allows
  a preference. Allowing preferences on work email is a product policy change, not an
  implementation choice.
- Custom fields owned by Employment or Assignment are recorded against the primary
  employment and assignment only. Values for concurrent employments are not editable here.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/employee/module/src/lib/my-profile.database.spec.ts`: 8 tests pass. They
  cover:
  - the Self allowlist with edit modes and preferences, read-only employment facts, and a
    Hidden field and collection disappearing (TEST-MY-PROFILE-001, TEST-MY-PROFILE-005);
  - the unlinked account state, with commands returning 404 (TEST-MY-PROFILE-001);
  - personal facts with display-name derivation, replay, idempotency conflict, stale
    revision, audit field names without values, `field-not-editable` under a narrowed edit
    mode, and a refused legal-name field (TEST-MY-PROFILE-002, TEST-MY-PROFILE-008);
  - contacts: unverified, bad shapes refused, one primary with promotion on removal, and
    another worker's contact 404;
  - relationships: duplicate priority, ineligible dependant, missing priority, update, the
    emergency category becoming non-editable while family stays editable, and reference
    options;
  - custom values set, replaced the same day, superseded from an earlier day with linked
    history, stale and unknown values refused, and a Sensitive value refused;
  - a preference that hides the preferred name from Toby's directory view, refuses widening
    under a narrower tenant policy, and restores the field when cleared
    (TEST-MY-PROFILE-004);
  - the four personas reading their own record, an unknown body field refused, a removed
    manage grant, a disabled entitlement and a disabled account (TEST-MY-PROFILE-006).
- `profile-policy.database.spec.ts` passes with the migration `000023` grant assertions.
- The employee database suite passes (35 tests), and so does the workforce suite.
- `apps/hcm/web-e2e/live/my-profile.spec.ts`: 6 live browser tests pass. They cover:
  - the own profile with HR-maintained labels, no correction control, and read-only
    employment, checked with axe;
  - the preferred name edited through the Dialog, with the discard confirmation on cancel;
  - a personal email with a `mailto:` Link and _Not verified_ status, then removed;
  - an emergency contact with a `tel:` Link, then removed;
  - a narrowed and restored preferred-name visibility;
  - 390/768/1440/2560 widths without horizontal overflow (TEST-MY-PROFILE-007).
- Also passing: the `hcm-web` production build, lint for the changed projects,
  `pnpm ux:check-pages`, `pnpm architecture:check`, `pnpm docs:check`,
  `pnpm hcm:catalogue:check`, `pnpm hcm:db:seed:check` and
  `pnpm hcm:app:readiness --app=MY_PROFILE --check`.

Axe excludes only the shared findings recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).

## Reproduction

```bash
pnpm hcm:db:up
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/employee
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts my-profile.spec.ts
pnpm hcm:app:readiness --app=MY_PROFILE --check
```
