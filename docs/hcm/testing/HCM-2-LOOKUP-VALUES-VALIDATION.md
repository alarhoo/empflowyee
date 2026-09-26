# Lookup Values validation

Branch: `codex/hcm-2-catalogue-organization-structure`. It carries delivery step 8 of
the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order) after steps
1 and 4–7.

## Behavior and review

Lookup Values (`LOOKUP_VALUES`) is released at `/workforce-foundation/lookup-values` as
`UX-FP-FCL` NATIVE, following the approved [FDD](../apps/lookup-values/FDD.md) and
[TDD](../apps/lookup-values/TDD.md).

- **API** (`/api/v1/workforce-foundation/lookup-sets`):
  - `GET` lists the eight sets with ownership and active value counts, and accepts no
    query parameters.
  - `GET …/:setKey/values` pages one set's values with cursors, sorted by order, name
    and id. `q` matches code and name, and `active` filters the state.
  - `POST …/:setKey/values` creates a value (201). `PUT …/values/:id` updates
    everything except the code at the expected revision. `POST …/values/:id/active`
    retires or reactivates a value. There is no delete.
  - Reads require `hcm.workforce-foundation.lookups.read`, and writes require
    `…lookups.manage`. Both also require entitlement `hcm.workforce-foundation`,
    rechecked inside the authorized transaction.
- **Tenant and product sets.**
  - Tenant sets: worker types, employment end reasons and worker event types, from
    migration `000019`.
  - Product sets: genders, marital statuses, relationship types, countries and
    currencies. Every mutation of a product set returns 400 `set-not-editable` before
    the value is looked up.
  - Attributes are a closed object per set, and unknown attributes are refused.
- **Approval flag.** The worker event type approval flag is display-only. Commands
  never accept or write `requiresApproval`, because the employment-change approval
  policy owns it.
- **Commands.** Each command writes the row, the revision, the idempotency receipt and
  an HCM-2 audit event in one transaction. The audit actions are
  `workforce.lookup-created`, `workforce.lookup-updated`, `workforce.lookup-retired`
  and `workforce.lookup-activated`, registered in the audit contract. Each event
  records the target type, the reason and the changed field names only.
- **Migration `000021_workforce_lookup_values.sql`.** Migration `000019` withheld
  UPDATE on `worker_type.statutory_class` and `worker_event_type.category`, so these
  attributes could not have been edited. The FDD says edits change everything except
  the code, so `000021` grants runtime UPDATE on those two columns only. `code`
  remains without an UPDATE grant.
- **UI.**
  - Begin column: `HcmDynamicPage` with a UI5 List of the sets, grouped into
    Organisation lists and Product lists. The mid column opens through the route
    `/lookup-values/:setKey`.
  - Mid column: `HcmDynamicPage` with code/name search and a Status Select. The
    server-mode UI5 Table shows 25 values per page, grows on request and uses Popin.
    Attributes are display-only CheckBoxes or text, and state is an inverted
    ObjectStatus.
  - Title actions: Add value (tenant sets only), Full screen and Close. Tenant rows
    have independent Edit and Retire/Reactivate buttons for managers.
  - Product sets and read-only viewers get the read-only page state and no mutation
    controls.
  - Create/edit and retire/reactivate are native Dialogs with Signal Forms. They use a
    Select for the statutory class and the event category, CheckBoxes for flags, a
    StepInput for the display order, and TextAreas for the description and reason.
- **Shared draft helpers.** The draft lifecycle and the discard confirmation that
  Organization Structure introduced now live in `hcm-web-ux-forms` as `HcmDraft` and
  `HcmDiscardDialog`, and both workforce features use them. Behaviour is unchanged.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/workforce-foundation/module/src/lib/lookup-values.database.spec.ts`:
  4 tests pass, run as the restricted runtime role. They cover:
  - the sets for David and Toby, value order and attributes, cursor paging, search
    and refused query parameters (REQ-001);
  - create, same-key replay, different-payload 409, duplicate code, malformed code,
    unknown attribute, update with changed-field audit, refused code change, stale
    revision, retire, the inactive filter, reactivate, and a refused approval flag
    (REQ-002, REQ-003, REQ-007);
  - `set-not-editable` on product sets, no delete route, runtime INSERT only on tenant
    tables, no DELETE anywhere and no UPDATE on `code` (REQ-003, REQ-004);
  - denial for Jim and Michael, a Toby write, a disabled entitlement and a disabled
    actor, and invisibility of another tenant's value (REQ-005).
- `pnpm hcm:db:test`: 182 of 183 tests across 29 files pass. The one failure is the
  pre-existing Linux-only `local-document-files.spec.ts` case described in the
  [Organization Structure record](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#verification).
- `apps/hcm/web-e2e/live/lookup-values.spec.ts`: 6 live browser tests pass. They cover:
  - sets grouped by ownership with counts, a read-only product set, route-driven
    selection through browser history, and an unknown set key;
  - add with a refused malformed code, edit, retire and reactivate, with no delete;
  - a dirty draft kept until the discard is confirmed;
  - read-only HR Operations, with the API refusing Toby's write;
  - 390/768/1440/2560 widths with no outer overflow;
  - a failed load with Retry and no fixture fallback.
- The Organization Structure (6) and Identification Types (4) suites pass alongside
  it. In one run, the Organization Structure defaults test timed out waiting for the
  native toolbar overflow and passed on re-run. This is the known shared overflow
  watch item.
- Also passing: `hcm-web` and `hcm-api` production builds, lint for the changed
  projects, `hcm-web-ux-forms` unit tests (3), `pnpm ux:check-pages`,
  `pnpm architecture:check`, `pnpm docs:check`, `pnpm hcm:catalogue:generate` and
  `pnpm hcm:app:readiness --app=LOOKUP_VALUES --check`.

Axe excludes only the shared inverted positive ObjectStatus `color-contrast` finding and
the native FCL separator arrow targets recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).
The page has no Display Form.

## Open points

- **Option endpoints.** REQ-003 says a retired worker type is absent from option
  endpoints. Those pickers belong to the employee apps that consume the lists, and the
  rule is enforced when they are delivered.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:db:test
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts lookup-values.spec.ts
pnpm hcm:app:readiness --app=LOOKUP_VALUES --check
```
