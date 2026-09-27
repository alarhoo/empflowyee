# Employee Records validation

Branch: `codex/hcm-2-employee-records`, started from `codex/hcm-2-ux-wizard-floorplan`. It carries
the Employee Records app, delivery step 13 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order), and the first live use of
the shared `HcmWizardPage` from step 2.

## Behavior and review

Employee Records (`EMPLOYEE_RECORDS`) is released at `/employee/employee-records` as `UX-FP-FCL`
NATIVE, with worker creation on `/employee/employee-records/new` as `UX-FP-WIZARD`. It follows the
approved [FDD](../apps/employee-records/FDD.md) and [TDD](../apps/employee-records/TDD.md).

- **API** (`/api/v1/employee/records`): reads, options, the person correction, collection items,
  the emergency reveal, the duplicate check, creation and merge.
  - Reads need `records.read`, commands and options `records.manage`, and the reveal
    `records.emergency.read`. Every operation re-authorizes on the server (REQ-EMPLOYEE-RECORDS-007).
  - Every command states a reason, runs in one transaction with its revision check, audit event
    and idempotency receipt, and reports success only after commit (REQ-EMPLOYEE-RECORDS-009).
- **Find (REQ-EMPLOYEE-RECORDS-001).** Search matches the name, the worker number or a work email.
  Filters: employment status, legal entity, unit, department, location, worker type and record
  state. A record is Incomplete when it has no employment, no employment status, or an assignment
  without an effective start.
- **Inspect (REQ-EMPLOYEE-RECORDS-002).** Person fields follow the HR allowlist of the profile
  policy; a field outside it is omitted, never shown empty. Employments, assignments and reporting
  lines are read-only and state that Employment Changes changes them. History is the worker event
  timeline. A merged-away worker's URL shows its survivor with a notice, and the survivor is not
  edited through that URL.
- **Correct (REQ-EMPLOYEE-RECORDS-003).** Names, birth date, gender, marital status and nationality
  are corrected with the person revision. Addresses are added, corrected (the current address
  closes the day before the correction starts), or ended. Personal contact points and relationships
  are added, corrected or deactivated; history is kept. Gender, marital status, nationality and
  country are checked against their reference lists as field errors. The audit names changed
  fields, never values.
- **Emergency reveal (REQ-EMPLOYEE-RECORDS-006).** Record reads mask emergency contact numbers and
  omit the blood group. The reveal needs the emergency permission and a purpose, is audited as
  sensitive access with the purpose, and its values live only in the Dialog that asked for them.
- **Create (REQ-EMPLOYEE-RECORDS-004).** The wizard steps are Person, Employment, Assignment and
  manager, Duplicate check and Review. Each step is validated before moving on, with focus on the
  first invalid field; the review submits one command with one retained idempotency key. The
  server creates the person and worker, the primary employment (Pending for a future hire date,
  Active otherwise), the primary assignment, the solid line to the manager's primary assignment
  and the Hired event together, and applies the WorkforceActivation requiredness of the profile
  policy. A server field error returns the user to the step that owns the field.
- **Duplicates (REQ-EMPLOYEE-RECORDS-005, DEC-HCM2-001).** Candidates are people with the same
  normalized legal name and birth date, or employments with the same work email. The check runs
  on entering the step and again when those facts change. Candidates block progress until the user
  confirms a different person with a reason, which the server re-checks and audits; the user can
  instead open a candidate's record.
- **Merge (REQ-EMPLOYEE-RECORDS-010).** A duplicate is merged into a chosen survivor with a reason
  and both revisions. A duplicate whose worker has an established employment is refused with
  `merge-requires-correction`.
- **UI.** The list has an Avatar with the name, and employment status and record state as
  inverted ObjectStatus. The record Object Page has Overview, Personal, Contact (email and phone
  as Links), Addresses, Family and emergency, Employment and History sections. One focused Dialog
  serves every command. References use server-filtered ComboBoxes, fixed lists Selects, dates
  DatePickers, numbers StepInputs and flags CheckBoxes. Data comes from the real API; there are no
  fixtures or feature CSS (REQ-EMPLOYEE-RECORDS-008).

## Open points

- Employment and assignment facts point to Employment Changes in text only; the link is added
  when Employment Changes is released in step 14. Continuing with an existing person as a rehire
  also lands there.
- The merge survivor is chosen from active workers.
- The server-filtered ComboBox (shared in shape with Positions) sometimes does not open its
  suggestions while typing when the same text was just chosen in another field. F4 opens them;
  the browser spec uses that fallback.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/module/src/lib/employee-records.database.spec.ts`: 7 tests pass. They
  cover search and filters, the allowlisted record without emergency values, corrections with a
  reason and field-name audit, the reveal with and without the permission, pending creation with
  employment, assignment, manager line and Hired event, duplicate blocking and audited resolution,
  and the merge rule. The employee and workforce suites pass with 60 tests.
- `apps/hcm/web-e2e/live/employee-records.spec.ts`: 3 browser tests pass four runs in a row
  (12 of 12) against the live stack. They cover the list with a location filter and the record
  sections at 390, 768, 1440 and 2560 pixels with axe; a contact point added and deactivated with
  reasons and the purpose-bound reveal with axe on the Dialog; and worker creation through the
  wizard with keyboard stepping, axe on the wizard, and a second creation blocked by a duplicate
  until it is resolved with a reason. The Positions browser spec still passes.
- Lint for the changed projects, the `hcm-api` and `hcm-web` builds, the wizard floorplan unit
  tests and `pnpm hcm:catalogue:validate` pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/employee libs/hcm/api/workforce-foundation
pnpm exec playwright test -c <local config> live/employee-records.spec.ts live/positions.spec.ts
```
