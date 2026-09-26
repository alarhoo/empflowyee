# Identification Types validation

Branch: `codex/hcm-2-catalogue-organization-structure`. It carries delivery step 6 of
the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order) after steps
1, 4 and 5.

## Behavior and review

Identification Types (`IDENTIFICATION_TYPES`) is released at
`/workforce-foundation/identification-types` as `UX-FP-DYNAMIC-PAGE` NATIVE, following
the approved [FDD](../apps/identification-types/FDD.md) and
[TDD](../apps/identification-types/TDD.md).

- **API.** `GET /api/v1/workforce-foundation/identification-types` returns the
  bounded product catalogue (at most 500 rows, sorted by name then code) and accepts
  no query parameters. `GET …/options/countries` pages the countries that issue at
  least one type. The page uses it for the Issuing country filter and for country
  names. Both require `hcm.workforce-foundation.identification-types.read` and
  entitlement `hcm.workforce-foundation`, rechecked in the authorized transaction.
- **Product ownership.** Per DEC-HCM2-016 there is no mutation handler, permission
  or control. Rows come only from migration `000017`, and the runtime role has
  SELECT only.
- **No identifier values.** The DTO carries the product-authored validation
  description, never the raw pattern, and no person reference, value, hash or count.
- **UI.** One `HcmDynamicPage` with code/name search, a keyed Issuing country
  ComboBox (with _All countries_ for types issued anywhere) and a Status Select in
  the header. The client-mode UI5 Table uses Popin, read-only CheckBoxes for the
  three characteristics and an inverted ObjectStatus for the active state. Sorting
  uses the shared `HcmViewSettings`. There is no row navigation, because the row
  holds every property.

### Shared fix: view settings

The shared `HcmViewSettings` created its UI5 ViewSettingsDialog already open, so
UI5 read the settings before the sort items were slotted, and the dialog showed
empty lists in every app. The dialog now stays mounted and opens through its `open`
property. Role Management's server-side sort request (`label:desc`) now completes in
`native-data-presentation.spec.ts`. The UI5 view-settings rows expose their labels
only inside nested shadow trees, so the specs select them by position.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/workforce-foundation/module/src/lib/identification-types.database.spec.ts`:
  5 tests pass. They cover:
  - the catalogue for David and Toby, with no raw pattern or value (REQ-001, REQ-003);
  - retired types shown as Inactive;
  - country paging, search and a cursor refused for another actor;
  - no mutation route and SELECT-only runtime privileges (REQ-002);
  - independent denial for missing grant, disabled entitlement and disabled actor (REQ-004).
- `pnpm hcm:db:test`: 173 of 174 tests across 27 files pass. The one failure is the
  pre-existing Linux-only `local-document-files.spec.ts` case described in the
  [Organization Structure record](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#verification).
- `apps/hcm/web-e2e/live/identification-types.spec.ts`: 4 live browser tests pass,
  in two consecutive runs. They cover:
  - filters and characteristics, with no mutation controls;
  - native sorting, and 390/768/1440/2560 widths with no outer overflow and axe;
  - failed load with Retry and no fixture fallback (REQ-005);
  - API authorization for HR Operations and refusal of writes.
- Also passing: `hcm-web` and `hcm-api` production builds, lint for the changed
  projects, `hcm-web-ux-tables` unit tests (4), `pnpm ux:check-pages`,
  `pnpm architecture:check`, `pnpm docs:check`, the catalogue checks and
  `pnpm hcm:app:readiness --app=IDENTIFICATION_TYPES --check`.

Axe excludes only the shared inverted positive ObjectStatus `color-contrast`
finding recorded for [Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).
The page has no Display Form and no three-column layout.

## Open points

- **HR Operations navigation (resolved).** The FDD names HR Operations as a reader,
  but discovery was Administration-only. The product owner resolved this as
  [DEC-HCM2-018](../roadmap/HCM-2-DELIVERY.md#implementation-decisions):
  `access.discovery@4` grants `hr-specialist` discovery, and the app joins the HR
  specialist catalogue. The acceptance test now opens the app as Toby.
- **Unrelated failure seen while re-running the shared sort test.** In
  `native-data-presentation.spec.ts`, the role-sorting case now gets past view
  settings but fails later: its role-detail `[fd-object-status]` locator matches two
  elements under strict mode. This predates this change and was left unchanged.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:db:test
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts identification-types.spec.ts
pnpm hcm:app:readiness --app=IDENTIFICATION_TYPES --check
```
