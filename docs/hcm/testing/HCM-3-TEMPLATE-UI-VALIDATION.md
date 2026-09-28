# HCM-3 Work Schedule Templates acceptance

Verified locally on 2026-09-28. Codex technical review under the existing
[delegated authority](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority), not a separate
human review or production deployment. `WORK_SCHEDULE_TEMPLATES` is implemented
and accepted for its approved boundary. The other 22 HCM-3 apps remain Planned.

## Delivered behavior

The guarded lazy route `/attendance/work-schedule-templates` exposes the real
server-owned list, exact-version detail, `/new` and `/:id/edit?version=...` editors.
Native FCL contains HcmDynamicPage and HcmObjectPage; the complex editor has its
own Dynamic Page. Native UI5 Form, Table, DatePicker, TimePicker, Select, ComboBox,
StepInput and focused Dialogs bind Angular Signal Forms. Status is the maintained
inverted Fundamental ObjectStatus. There is no feature CSS or fixture fallback.

The editor loads persisted incomplete seed proposals. Effective date, timezone
and explicit unpaid interval placement (or an explicit change to proposed minutes)
are necessary before a draft can save. Cross-midnight endpoints and milliseconds
survive a real API edit. Minimum-rest validation remains unconfigured unless
explicitly selected. The shared wall-time formatter respects account time/locale
preferences without assigning an instant or shifting the local pattern.

Publication requires the actor-bound preview and current source revision. Copies
are independent ordinary schedule drafts with source attribution; the UI says
that their dated review/publication belongs in Work Schedules. Retirement preserves
existing copies. Successors create independently editable versions. Unknown command
completion retains the original key; a dropped committed publication reply recovers
through the same real API receipt. Private reasons stay out of list/detail projections.

The [API](HCM-3-TEMPLATE-API-VALIDATION.md),
[command/publication](HCM-3-TEMPLATE-PUBLICATION-VALIDATION.md),
[storage](HCM-3-SCHEDULE-STORAGE-VALIDATION.md) and
[canonical seed](HCM-3-SEED-DEFAULTS-VALIDATION.md) records provide prerequisite
SQL/RLS, independent authorization, immutable evidence, rollback/concurrency and
seed validation. This UI slice introduces no migration or background handler.

## Executed checks

- Two Chromium journeys pass against the fresh production build, real Nest module,
  restricted PostgreSQL runtime role and canonical versioned seed. Each run owns
  disposable PostgreSQL and loopback HTTP servers; the developer database is untouched.
- Journey one opens the canonical Administration tile; blocks incomplete create;
  explicitly changes proposed unpaid minutes; saves; preserves/discards dirty edits;
  previews/publishes; drops a committed response and recovers with the same key;
  validates/focuses an invalid copy; copies independently; retires; creates a successor;
  and verifies desktop/narrow FCL close and restoration of focus to the originating row.
- Journey two verifies empty filters, a failed real read and retry, native keyboard
  navigation, Maximize/Minimize, exact overnight milliseconds after edit, editor
  accessibility, delayed old-context response clearing and direct-route denial
  after switching to an unauthorized canonical persona.
- The focused HCM-3 pure suite passes 57 tests in 15 files, including four form
  boundary cases. Shared runtime formatting passes 12 existing/extended tests.
  The seven template PostgreSQL/HTTP cases pass with the updated browser harness.
- Targeted ESLint, module TypeScript (`--noEmit --allowImportingTsExtensions`),
  production `hcm-web` build, architecture and documentation checks pass. The
  existing unrelated PositionRequirementSet unused-import compiler warning remains.

Screenshots at 1440 x 1000 and 390 x 844 plus the exact-time editor were inspected.
They are reproducible local outputs under `.tmp/hcm-template-*.png`; generated
screenshots are not source-of-truth documents. Review corrected a duplicate
landmark label, placed the identity form in the native header area, and delayed
focus restoration until the list column is rendered. Installed StepInput has no
ControlValueAccessor: its native numeric events update the same Signal Form field;
there is no second form framework or imitated input.

Final reviewed-document readiness passes: template 1/1, HCM-3 23/23 and all
admitted apps 61/61, with zero blockers. Decisions 001, 002, 009, 017 and 018
remain later-capability warnings and do not block current implementation.

## Accessibility scope

Feature axe checks pass with narrowly identified existing shared findings retained
from [HCM-2 native-control evidence](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared):
Display Form definition-list semantics in UI5 shadow trees, the exact FCL separator/
arrow targets and contrast only on native inverted ObjectStatus markup. Other
contrast and landmark findings remain failures. This is not a claim of zero shared
library accessibility defects or a new theme-matrix certification.

The isolated Nest composition includes Attendance, Runtime and Access. Shell
notification requests return honest unavailable responses because Notifications
is outside this harness; no notification content is mocked. Production hcm-api
retains its existing Notifications composition.

## Reproduction

Prerequisites: repository pnpm dependencies, Docker and Playwright Chromium.

```sh
pnpm exec nx build hcm-web --configuration=production
pnpm exec vitest run --config tools/milestones/hcm-3/browser.config.mts libs/hcm/api/attendance/module/src/lib/templates-browser.spec.ts
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/module
pnpm exec vitest run --config libs/hcm/web/runtime/context/vite.config.mts src/lib/hcm-runtime.store.spec.ts
pnpm ux:check-pages
pnpm architecture:check
pnpm docs:check
pnpm hcm:app:readiness --app=WORK_SCHEDULE_TEMPLATES --check
pnpm hcm:app:readiness --wave=HCM-3 --check
pnpm hcm:app:readiness --admitted --check
```

Local interactive use requires explicitly applying approved migrations through 42
and canonical seeds using the database runbook, then starting hcm-api/hcm-web.
Use the canonical David Wallace development persona and Administration / Reference
Data and Policies / Work Schedule Templates. Production authorization still depends
on persisted grants; neither a title nor tile visibility creates authority.
