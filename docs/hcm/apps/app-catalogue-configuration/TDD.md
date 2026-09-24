# App Catalogue Configuration — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/access-control/app-catalogue-configuration`; lazy feature `libs/hcm/web/access-control/feature-app-catalogue-configuration`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Inspect canonical applications, placements and tenant entitlement/discovery projections without editing commercial configuration. Use the domain DTO projection, not SELECT * or entity serialization.
Client q on title/code/domain; domain/status/entitled filters; title or appCode sort. Bounded canonical inventory is currently 170 entries; no business dataset prefetch.

Show the full current canonical metadata with tenant entitlement projection; Planned and Available are distinct.

## API

All DTOs/validation belong to `hcm-access-control-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-ACCESS-CONTROL.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                                             | Permission                          | Request                           | Response                                                      |
| --------------------------------------------------------------------- | ----------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `GET /api/v1/access-control/catalogue`                                | `hcm.access-control.catalogue.read` | `None`                            | `{items:CatalogueEntry[]}`                                    |
| `GET /api/v1/access-control/catalogue/accounts`                       | `hcm.access-control.catalogue.read` | `List query: q displayName/email` | `Page<{id,displayName,email}>`                                |
| `GET /api/v1/access-control/catalogue/accounts/{accountId}/discovery` | `hcm.access-control.catalogue.read` | `None`                            | `{accountId,items:[{appCode,discoverable,reasons:string[]}]}` |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Optionally choose a tenant account and inspect effective discovery reasons from server grants and entitlements.

No business edit form. Search/filter state still uses Signals and maintained labeled controls; loading/error/denied states never synthesize data.

Changing the selected account updates only the explanation and never impersonates it.

## RULES

No UI/API edits to catalogue routes, placements, implementation status or Account-owned entitlements.

Attempt mutation methods and tenant/account injection; no corresponding transport mutation exists.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-ACCESS-CONTROL.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.access-control`. Discovery remains
`hcm.catalogue.APP_CATALOGUE_CONFIGURATION.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission                 | Authorized function                                             |
| ----------------------------------- | --------------------------------------------------------------- |
| `hcm.access-control.catalogue.read` | Read tenant catalogue and optional account discovery evaluation |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `canonical-app-catalogue (global immutable projection)` — owned by navigation; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `tenant_entitlement` — owned by access-control; this app uses the owning domain contract.
- `access_permission` — owned by access-control; this app uses the owning domain contract.
- `account_role` — owned by access-control; this app uses the owning domain contract.
- `role_permission` — owned by access-control; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-ACCESS-CONTROL.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
SQL and versioned seeds are designed here but not created/run in this delivery.

## UX

Floorplan `UX-FP-DYNAMIC-PAGE`, mode **NATIVE**. Use existing HcmDynamicPage with persistent title/actions and collapsible filter/scope context; native table and Dialog content remain feature-owned.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection. No Object Page, generated List Report or custom floorplan.

Content columns/fields: App code/title; domain; implementation status; entitlement/enabled projection; placements; optional discoverability reason.

Table declaration: mode **client**. Client q on title/code/domain; domain/status/entitled filters; title or appCode sort. Bounded canonical inventory is currently 170 entries; no business dataset prefetch.
Load the explicitly bounded collection once; filter/sort only that returned collection.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

No business edit form. Search/filter state still uses Signals and maintained labeled controls; loading/error/denied states never synthesize data.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                                      | Root                                                              | Tags                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hcm-web-access-control-feature-app-catalogue-configuration` | `libs/hcm/web/access-control/feature-app-catalogue-configuration` | `product:hcm`, `runtime:web`, `domain:access-control`, `type:feature`        |
| `hcm-web-access-control-data-access`                         | `libs/hcm/web/access-control/data-access`                         | `product:hcm`, `runtime:web`, `domain:access-control`, `type:data-access`    |
| `hcm-access-control-contract`                                | `libs/hcm/contracts/access-control`                               | `product:hcm`, `runtime:universal`, `domain:access-control`, `type:contract` |
| `hcm-api-access-control-domain`                              | `libs/hcm/api/access-control/domain`                              | `product:hcm`, `runtime:api`, `domain:access-control`, `type:domain`         |
| `hcm-api-access-control-application`                         | `libs/hcm/api/access-control/application`                         | `product:hcm`, `runtime:api`, `domain:access-control`, `type:application`    |
| `hcm-api-access-control-infrastructure`                      | `libs/hcm/api/access-control/infrastructure`                      | `product:hcm`, `runtime:api`, `domain:access-control`, `type:infrastructure` |
| `hcm-api-access-control-transport`                           | `libs/hcm/api/access-control/transport`                           | `product:hcm`, `runtime:api`, `domain:access-control`, `type:transport`      |
| `hcm-api-access-control-module`                              | `libs/hcm/api/access-control/module`                              | `product:hcm`, `runtime:api`, `domain:access-control`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Reuse runtime-universal catalogue exports and tenant projection; no import of browser navigation implementation into Nest.

Foundation contracts are existing HCM0-01 launchpad, HCM0-02 database, HCM0-03
seed framework and HCM0-04 verified runtime context. The blueprint references their
actual validation records. Domain contract definitions are complete for review;
their implementation remains an ordered prerequisite, not a claim of existing code.

## OPERATIONS

[Observability](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#obs), migration/seed/rollback
and storage recovery (where applicable) are mandatory. Dunder Mifflin data lives
in versioned PostgreSQL seeds. Seed new grants as approved; do not seed fictitious
success audit/export history or inject arrays into Angular. Keep production auth
disabled and external integrations deferred.

## TEST

[Traceability](TRACEABILITY.md) maps every FDD requirement to the selection and
a named planned test. Execute unit, API/RLS and real-browser cases during the
implementation slice; no test in that document is claimed executed by design review.
Use [shared execution criteria](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#test).

## DELIVERY

Branch `codex/hcm-1-app-catalogue-configuration` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
