# Organization Structure validation

Branch: `codex/hcm-2-catalogue-organization-structure`. It carries delivery steps 1
(catalogue admission), 4 (workforce structure foundation) and 5 (the app) of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Organization Structure (`ORGANIZATION_STRUCTURE`) is released at
`/workforce-foundation/organization-structure` as `UX-FP-FCL` NATIVE, following the
approved [FDD](../apps/organization-structure/FDD.md) and
[TDD](../apps/organization-structure/TDD.md).

- **Begin column.** `HcmDynamicPage` with a UI5 List of the seven areas.
- **Mid column.** Legal entities and unit types are bounded client lists (at most
  200, with a truncation notice). Departments, designations and locations use a
  server-mode table with 25-row growing and whole-row navigation. Units use a lazily
  expanded UI5 Tree at an as-of DatePicker date. Each parent loads 100 children at a
  time, and a search returns a flat result. The organisation area shows HR defaults;
  the Account-owned display name has no edit control.
- **End column.** `HcmObjectPage` with Overview, plus Versions (UI5 Timeline) and
  Usage for units. The shared Object Page gained a `column` input so an end-column
  detail maximizes to `EndColumnFullScreen` instead of collapsing the layout.
- **Forms.** Units, legal entities and locations use dedicated routes
  (`:area/new`, `:area/:id/edit`); for units, edit adds an effective-dated version.
  Unit types, departments, designations, organisation defaults and
  retire/disable/reactivate use Dialogs. All use Signal Forms, keep failed drafts,
  confirm dirty leave, and reuse one idempotency key per unchanged command.
- **Pickers.** Reference pickers are UI5 ComboBoxes keyed by `selectedValue`, backed
  by `GET /structure/options/{kind}` with server filtering. Time zone is a
  client-filtered ComboBox over the browser's IANA list, because the API has no
  time-zone option kind. Language is a bounded Select that always includes the
  stored tag.
- **Theme and access.** No feature CSS, theme imports or fixture data. Mutation
  controls follow `structure.manage`; every endpoint re-authorizes on the server.

The API, persistence and seeds (migrations `000017`–`000018`,
`workforce.foundation@2`, `access.hcm2@1`) were delivered earlier on this branch.

## Verification

Recorded on 2026-09-26 against the local stack (`pnpm hcm:db:up`: 18 migrations,
12 seed versions).

- `apps/hcm/web-e2e/live/organization-structure.spec.ts`: six live browser tests
  pass, in two consecutive runs.

  | Test                         | Covers                                                                                                                               |
  | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
  | Unit tree browse             | Keyboard expansion, inherited legal entity, Versions and Usage tabs, as-of date excluding not-yet-effective units (REQ-001)          |
  | Area widths                  | Every area at 390/768/1440/2560 with no outer overflow; organisation defaults (REQ-001, REQ-008)                                     |
  | HR Operations read-only      | Toby opens the app with no mutation controls; API reads return 200, options 403 and a well-formed create 403 (REQ-007, DEC-HCM2-017) |
  | Designation dialog lifecycle | Dirty cancel, focus on the missing reason, create, edit, retire, reactivate (REQ-006, REQ-008, REQ-009)                              |
  | Unit route lifecycle         | Routed create with pickers, dirty-leave guard, overlapping version rejected (409), dated version, timeline, retirement (REQ-005)     |
  | Organisation defaults        | Invalid time zone refused with focus; save and restore; no tenant-name control (REQ-002)                                             |

- `pnpm hcm:db:test`: 168 of 169 tests across 26 files pass. The workforce spec
  covers permission-gated reads, idempotent create, duplicate codes, stale
  revisions, cycles, the unit type chain, effective versions, revisioned defaults
  and foreign-tenant isolation. The access foundation spec now expects the
  `access.discovery@2` grant and the 36 `access.hcm2@1` business permissions (75 in
  total). The one failure, `local-document-files.spec.ts`, is pre-existing and
  platform-specific: it removes a directory symlink with `rmdir`, which works for a
  Windows junction but raises `ENOTDIR` on Linux.
- Also passing: `hcm-web` production build, lint for the new and affected projects,
  Object Page unit tests (4), `pnpm ux:check-pages` (76 templates),
  `pnpm architecture:check`, `pnpm docs:check`, `pnpm hcm:catalogue:check`,
  `pnpm hcm:catalogue:validate` and `pnpm hcm:app:readiness --app=ORGANIZATION_STRUCTURE --check`.

### Accessibility findings excluded as shared

Axe runs on every tested state. The spec excludes only these findings, which
belong to shared components, not this app:

- `color-contrast` on the inverted positive ObjectStatus (the known shared
  regression in the [Document Requests record](HCM-1-DOCUMENT-REQUESTS-VALIDATION.md)).
- `definition-list`, `dlitem` and `only-dlitems` from the UI5 Display Form, as
  documented in the [floorplan validation](../ux/floorplans/validation.md). Edit
  forms avoid FormGroup, so they raise none.
- New: the native three-column FCL separator arrow button has no accessible name
  (`button-name`), and it sits inside the focusable separator (`nested-interactive`).
  `accessibilityAttributes` can rename separators only with landmark roles and
  cannot label the arrow. This needs a shared UX/upstream decision. The spec
  excludes only those two FCL shadow targets.

## Open points

- **HR Operations read access (resolved).** The reviewed seed granted discovery
  to Administration only, although the FDD names HR Operations as a reader. The
  product owner resolved this as
  [DEC-HCM2-017](../roadmap/HCM-2-DELIVERY.md#implementation-decisions): `access.discovery@3` also grants
  `hr-specialist` discovery. Toby now opens the app read-only; the acceptance test
  asserts no mutation controls and API refusal of writes.
- **Position usage.** Unit usage shows current assignments and child units.
  Position counts arrive with `PositionReadPort` in the positions foundation (step 12).

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:db:test
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts organization-structure.spec.ts
pnpm ux:check-pages
pnpm architecture:check
pnpm docs:check
pnpm hcm:app:readiness --app=ORGANIZATION_STRUCTURE --check
```

The acceptance run leaves the designations and retired units it creates, along with
their audit events, in the local database. They are not seed fixtures.
