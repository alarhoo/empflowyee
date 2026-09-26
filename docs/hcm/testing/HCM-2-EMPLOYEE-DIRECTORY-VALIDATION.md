# Employee Directory validation

Branch: `codex/hcm-2-employee-directory`, started from `codex/hcm-2-org-chart`. It carries the
third app of delivery step 10 of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Employee Directory (`EMPLOYEE_DIRECTORY`) is released at `/employee/employee-directory` as
`UX-FP-FCL` NATIVE, following the approved [FDD](../apps/employee-directory/FDD.md) and
[TDD](../apps/employee-directory/TDD.md).

- **API** (`/api/v1/employee/directory`, read-only):
  - `GET` searches with q, `name:asc`/`name:desc` sorting, cursor pages of 25 (at most 100)
    and filters `unitId`, `departmentId`, `locationId` and `designationId`.
  - `GET {workerId}` returns one colleague, and `GET {workerId}/reports` pages their direct
    reports.
  - `GET options/{kind}` pages active units, departments, locations or designations for the
    filters.
  - Every read requires `hcm.employee.directory.read` and entitlement `hcm.employee`.
- **Workforce data through a port.** Workforce-foundation owns the queries, so the employee
  domain reads them through the new `WorkforceDirectoryPort`, bound with the other workforce
  ports. The port returns one row per worker with the primary placement, manager, report
  count and every current assignment. It includes only Active, OnNotice and Suspended
  employments with an assignment effective today; employment status is never serialized.
- **Field policy.**
  - Every entry passes through `ProfileFieldVisibilityPort` for the Organization relation,
    per worker, after tenant policy and allowed preferences.
  - Search predicates are built from the Organization search allowlist: names (contains, on
    the normalized name), work email prefix and worker number prefix. Personal contacts and
    identifiers are never searched.
  - A structure filter is refused with 400 when that field is not Organization-visible, and
    its options come back empty.
  - Narrowing work email to HR removes it from results, detail and search on the next
    request.
- **Reporting context.** The detail carries the manager link (with the manager's own name
  visibility), the direct report count, and every current assignment. The legal entity is
  shown where it is visible and the worker has several assignments.
- **UI.**
  - Begin column: `HcmDynamicPage` with a search Input and four server-filtered ComboBoxes in
    the header, native view settings for name sorting, and a server-mode table (25, growing,
    whole-row navigation, Popin) with Avatar initials.
  - Mid column: `HcmObjectPage` per worker with Overview (a `mailto:` Link for work email),
    Reporting (manager Link and direct reports) and Additional information (current
    assignments).
  - The deep link `/employee/employee-directory/:workerId` keeps the opaque id as one
    encoded segment.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/employee/module/src/lib/employee-directory.database.spec.ts`: 6 tests pass.
  They cover:
  - the workforce for all four personas, the Organization DTO, descending cursor paging and
    a refused sort (REQ-001, REQ-003);
  - name, work email and worker number search, a personal email never matched, and work email
    narrowing (REQ-002);
  - department options and filtering, and a filter refused while the department is not
    visible;
  - the colleague detail with manager, assignments and hidden fields absent, and the reports
    of Michael;
  - Pending excluded and Suspended included without status (REQ-004);
  - a missing grant, disabled entitlement, disabled actor, unknown worker and no mutation
    routes (REQ-005).
- The employee and workforce database suites pass (42 tests across 9 files).
- `apps/hcm/web-e2e/live/employee-directory.spec.ts`: 4 live browser tests pass. They cover:
  - search by name, email and worker number, and the department ComboBox filter;
  - the colleague detail with the `mailto:` link, the manager link, reports, and the deep link
    after a reload;
  - native descending sort, and 390/768/1440/2560 widths with axe;
  - a failed list read with Retry.
- Also passing: `hcm-web` and `hcm-api` production builds, lint for the changed projects,
  `pnpm ux:check-pages`, `pnpm architecture:check`, `pnpm docs:check` and
  `pnpm hcm:app:readiness --app=EMPLOYEE_DIRECTORY --check`.

Axe excludes only the shared findings recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).

## Open points

- **Preferred-name preference and name search.** A worker may keep their preferred name from
  the whole organisation. The name is then omitted from their entry, but the normalized
  search text still contains it, so a search by that preferred name can still find the
  person. The search text is owned by workforce-foundation; separating preferred names from
  it is a follow-up.

## Reproduction

```bash
pnpm hcm:db:up
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/employee
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts employee-directory.spec.ts
pnpm hcm:app:readiness --app=EMPLOYEE_DIRECTORY --check
```
