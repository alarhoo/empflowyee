# Holiday Calendars local acceptance

Verified 2026-10-03 (Asia/Calcutta). Holiday Calendars is locally accepted for
its FDD scope. Milestone 1 still requires Work Schedules and My Schedule, followed
by the selected Leave milestones.

The product owner's DEC-HCM3-024 answer requires explicit employment/timezone
context. The implementation reuses Attendance configuration storage, exact-time
holiday resolution, Workforce time facts, monthly period fences, encrypted command
receipts, current Access authorization and the shared AttendanceResolve worker.
Migration `000047_holiday_preview_context.sql` adds immutable typed context with
FORCE RLS and tenant-composite foreign keys. No applied migration was edited.
Canonical `access.attendance@2` grants the five calendar operations independently
to the reference-data administrator; discovery remains separate.

## Executed checks

- `pnpm exec nx build hcm-web --configuration=production`: passed. The existing
  unrelated PositionRequirementSet unused-import warning remains.
- `pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts`:
  115 tests in 20 files passed, including editor and assignment contract tests.
- The focused `holiday-form.spec.ts` run: four tests passed, covering exact values,
  required input, partial intervals, correction and contract boundaries.
- The focused `holiday-publication.database.spec.ts` run: eleven tests passed against
  disposable PostgreSQL and real Nest HTTP. Coverage includes mandatory context,
  actual worker execution, publication/replay/retirement, DST gaps/overlaps,
  collisions, stale Workforce facts, operation denial, source edits before worker
  execution, duplicate admission, multi-year declared dates, missing preview 404,
  unknown query rejection, tenant isolation, foreign references and immutable
  context privileges and minimal calendar-authorized reference pickers.
  Assignment cases prove same-key recovery, altered-key conflict, exact predecessor
  supersession, overlap/stale revision rollback, actual workday worker materialization,
  one complete scope grant, revocation, foreign targets and DST gaps in the actual
  target employment zone. Seven Access scope tests also pass.
- Existing Holiday draft/read and command suites: ten tests passed in the combined
  run; the publication suite's missing-preview failure in that run was subsequently
  fixed and the focused reruns passed.

Persistent local PostgreSQL was backed up before explicit migration 47. Database
startup applied one migration and no additional seed versions on 2026-10-03;
the existing local encryption key and data were preserved.

## Technical review

Codex reviewed the Holiday TDD refinement against the recorded product answer,
FDD requirements 001/002/004/006, common asynchronous result and transaction rules,
and the installed native components. The corresponding app design and traceability
records bind this actual technical review. It is not separate human approval;
UI acceptance comes from the executed browser checks.
No new trust boundary, deployable or persistence owner is introduced.

Two browser journeys pass against the normal production build, real Nest HTTP,
restricted PostgreSQL role and canonical seeds. The first opens the Available tile
as David Wallace, rejects invalid input, creates/reloads a calendar, selects an
explicit employment/zone, executes a real worker preview and publishes. It assigns,
recovers a dropped committed response with the same key, inspects after reload,
supersedes exact coverage, preserves a dirty form, retires, and exercises keyboard
and narrow FCL interaction. The second verifies empty results, transport failure
and retry, cancellation of old-context data after persona change, and direct-route
denial for Jim. No route guard or availability override is used in these final runs.
Earlier isolated builds were implementation checks only.

Shared native Form/FCL and inverted ObjectStatus accessibility exceptions remain
narrowly recorded in the test. Feature axe checks pass; this is not a claim that
those shared-library defects are fixed or that a theme matrix was certified.

The assignment refinement was reviewed against FDD requirement 003, the existing
typed assignment schema/exclusion, complete-grant authorization and the worker's
accepted-digest contract. Explicit bounded materialization dates are a technical
execution window, not an implicit assignment duration or entitlement. Supersession
only ends the predecessor and inserts a successor atomically. This design review
was followed by the executed assignment checks above. Native date-entry acceptance
also found the installed DatePicker/accessor live-input mismatch. Shared UX Forms
owns a minimal event binding (`HcmDateField`), and the native browser journey
checks rapid keyboard dates and retains native parsing/focus. No custom input,
shadow-tree access, feature styling or replacement form framework is introduced.
The TDD records exact fields, safe reference reads and explicit execution bounds.


Current verification also passes targeted ESLint, Attendance module TypeScript,
production hcm-web and hcm-worker builds, architecture, documentation, catalogue
and page-structure checks. Existing PositionRequirementSet unused import and
Temporal/jsbi optimization warnings remain visible. Seed `access.attendance@3`
adds assignment authority and separate discovery for the canonical administrator.
It was applied to persistent PostgreSQL after a new backup; zero migrations and
one seed version were applied, preserving existing records and encryption key.

The persistent local API reports healthy and the normal hostname
`http://acme.localhost:4302` opens the Available tile and real editor. Desktop and
390px editor screenshots were visually inspected; controls remain reachable without
feature styling. The documented AttendanceResolve poll worker starts successfully.
Target readiness passes 1/1. Broader admitted readiness is 59/61: existing stale
FDD/TDD/traceability approvals in My Profile and Org Chart remain unrelated failures
and were not rewritten to clear this gate.

## Local journey and reproduction

### Native control readiness regression, 2026-10-03

The combined Templates/Holiday browser run exposed intermittent rapid date-entry,
assignment-checkbox and transition-time contrast failures. The installed native
form adapter initializes listeners on an animation frame. Browser checks now wait
for fonts, two rendered frames and running finite transitions before newly mounted
date/checkbox interactions and accessibility measurement. The helper does not
alter controls, API responses, business assertions or accessibility exclusions.
Angular UI5 host tags are not all registered custom elements, so waiting for every
prefixed tag's `customElements.whenDefined` is invalid and was removed after a
failed diagnostic run. Paused and infinite effects are excluded from transition
waiting. Assignment acceptance additionally asserts that the real submitted POST
contains the selected supersession reference.

Two consecutive combined regressions each passed 62 tests across seven suites on the existing
production web build and fresh PostgreSQL/API composition. Earlier diagnostic
failures remain failed evidence; this result does not accept Work Schedules or
any Leave UI. No production component, policy rule or catalogue status changed.

Open `http://acme.localhost:4302/attendance/holiday-calendars` as David Wallace
(Tenant Administrator), or Administration → Reference Data and Policies → Process
and Time → Holiday Calendars. HR Operations retains its existing placement for
independently authorized HR roles. Tile discovery never grants business authority.

1. Create a uniquely coded calendar with explicit effective, actual and observed
   dates, category and priority. Save and reload.
2. Open Preview and publish; select a worker and explicit employment, a matching
   real location timezone and review dates. Request preview, run the documented
   AttendanceResolve worker and refresh to Ready. Give a reason and confirm.
3. In Assignments, select Employment, find Jim and select his employment. Enter
   explicit coverage/resolution dates and reason. Assign and reload; inspect the
   same scope/date. Missing schedule/policy inputs report unavailable dates without
   fabricating workdays. Work Schedules supplies those dependencies.
4. To supersede, inspect a later effective date and explicitly choose the current
   predecessor. The command preserves historical coverage and exact revision.

Start database/API/web with the root README commands. Use the [worker runbook](../operations/WORKER.md)
for an explicit local AttendanceResolve drain or poll runtime. No API/worker startup
runs migrations. The tests use only owned disposable databases.

```sh
pnpm exec nx build hcm-web --configuration=production
pnpm exec nx run hcm-worker:build
pnpm exec vitest run --config tools/milestones/hcm-3/browser.config.mts libs/hcm/api/attendance/module/src/lib/holidays-browser.spec.ts
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/module/src/lib/holiday-publication.database.spec.ts
pnpm hcm:app:readiness --app=HOLIDAY_CALENDARS --check
```
