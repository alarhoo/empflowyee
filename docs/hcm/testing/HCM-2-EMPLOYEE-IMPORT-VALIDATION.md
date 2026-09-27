# Employee Import validation

Branch: `codex/hcm-2-employee-import`, started from `codex/hcm-2-documents-import-source`. It
carries the Employee Import app, the app part of delivery step 15 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Employee Import (`EMPLOYEE_IMPORT`) is released at `/employee/employee-import` as `UX-FP-FCL`
NATIVE, with new runs on a `UX-FP-WIZARD` route and templates on their own editor route. It
follows the approved [FDD](../apps/employee-import/FDD.md) and
[TDD](../apps/employee-import/TDD.md).

- **Data.** Migration `000031_employee_import.sql` adds templates, template columns, runs, rows
  and issues under tenant RLS. Columns change only while their template is a draft; a run reads
  only an `import-source` blob through a published template version, and its parser version is
  required once validation starts. Rows keep a SHA-256 digest of their source cells, never the
  values, and issues keep a field, a code and a safe message.
- **API** (`/api/v1/employee/import`): every operation in the TDD. Reads need `import.read`,
  commands `import.manage`. Every command reauthorizes, checks its revision and records its audit
  event and idempotency receipt in one transaction (REQ-EMPLOYEE-IMPORT-007).
- **Templates (REQ-EMPLOYEE-IMPORT-001).** Code, format, header row, date format, time zone and
  columns mapped to the 26 importable standard fields with allow-listed transformations and
  match keys (worker number, work email). Publishing freezes a version and retires the code's
  previous published version; a new version copies the settings and columns into one draft.
- **Runs (REQ-EMPLOYEE-IMPORT-002).** The upload is multipart, metadata first, at most 5 MiB,
  staged through `DocumentStoragePort`; its format must match the template. Unreadable,
  macro-enabled, encrypted or oversized files are refused with safe codes.
- **Validation (REQ-EMPLOYEE-IMPORT-003).** Every row is parsed, transformed and checked:
  required create fields, dates in the template format (workbook serial dates too), emails,
  worker numbers (duplicates in the file or already in use), and references resolved by exact,
  case-insensitive code against current active records. A header that does not name the mapped
  columns, a missing match key for Update or Upsert, or more than 2,000 rows fail the run with a
  file-level issue. Workforce tables are unchanged by validation.
- **Matches (REQ-EMPLOYEE-IMPORT-004, DEC-HCM2-001).** A new person is matched by normalized
  name and birth date or by work email; an update by its match key. Every matched row needs a
  resolution (use the existing worker, create a new one with a reason, or skip) that fits its
  proposed action, and commit is refused while any is unresolved.
- **Commit (REQ-EMPLOYEE-IMPORT-005).** The stored file is re-read and each row's digest checked.
  Each valid row runs in its own savepoint through `WorkforceFactsPort`: a create makes the
  person, worker, employment, primary assignment (job title from the designation), manager line
  and `HIRED` event; an update corrects person facts only (business rule 16). A refused row is
  recorded as CommitFailed with a safe code and the others still commit. Each row carries a
  unique idempotency key, and the command itself is idempotent.
- **Issue report (REQ-EMPLOYEE-IMPORT-006).** The CSV lists row number, field, column, severity,
  code and product message only, is served `no-store`, and is audited in the `export` category.
- **Seed.** `employee.operations@1` publishes the `NEW_HIRES` template, a column mapping with no
  personal data. HR discovery already existed through `access.hcm2@1`.
- **UI (REQ-EMPLOYEE-IMPORT-008).** The list scopes Runs and Templates with a status Select and
  inverted ObjectStatus. The run Object Page has Overview with counts, Rows filtered by status
  and match status, and File issues; the template Object Page has Overview and Columns. The run
  wizard (Template and action, Upload, Validate, Review matches, Commit) unlocks each step only
  after the server confirms the previous one. The template editor uses Select for format, date
  format and transformations, ComboBox for fields and time zone, CheckBox for header row and
  match key.

## Open points

- Only standard fields are importable; importing custom profile fields needs its own mapping and
  validation design.
- An update corrects person facts only; employment and assignment facts change through
  Employment Changes, and Upsert creates only new workers.
- Structure references resolve by code; worker types by name. A worker type left empty
  defaults to the Employee type.
- The run wizard lists the first page of each matched status; a run with more than 25 matched
  rows of one status is resolved from the run page's Rows section.
- Background processing of larger files and scheduled imports are outside HCM-2.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17 and the local stack.

- `libs/hcm/api/employee/domain/src/lib/import-rules.spec.ts`: 4 tests pass for transformations,
  date formats including workbook serial dates, cell parsing, digests, header checks, proposed
  actions and resolution rules.
- `libs/hcm/api/employee/module/src/lib/employee-import.database.spec.ts`: 4 tests pass. They
  cover the seeded template and 403 for employee and manager personas; validation with no worker
  row added, invalid dates and references, an existing worker number, a work-email match that
  blocks commit until skipped, a commit that creates the worker with assignment and manager line,
  and an issue report with no source value, audited as an export; drafting, publishing (edit
  then refused), an Update run resolved to the existing worker that changes only the preferred
  name, and versioning that retires the old version; a PDF refused with 415, header drift failing
  the run, cancellation, and paging.
- The employee, documents, database and access suites pass with 170 of 171 tests. The one
  failure, `local-document-files.spec.ts` rejecting hard links, fails the same way on the base
  branch in this environment, as recorded in the
  [import-source validation](HCM-2-DOCUMENTS-IMPORT-SOURCE-VALIDATION.md).
- `apps/hcm/web-e2e/live/employee-import.spec.ts`: 3 browser tests pass three runs in a row
  against the live stack. They cover a new-hire run through the wizard (template required,
  upload, validation, a match resolved as Skip before commit, the committed run with its safe
  issues and the report download) with axe on the wizard, the Dialog and the page; drafting,
  publishing and versioning a template with axe on the editor; and an employee without access.
  The Employment Changes and Employee Records browser specs still pass.
- Lint for the changed projects, the `hcm-api` and `hcm-web` builds, `pnpm hcm:db:seed:check`
  and `pnpm hcm:catalogue:validate` pass.

## Reproduction

```bash
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/employee/domain
pnpm hcm:db:test libs/hcm/api/employee libs/hcm/api/documents libs/hcm/api/database libs/hcm/api/access-control
pnpm exec playwright test -c <local config> live/employee-import.spec.ts
```
