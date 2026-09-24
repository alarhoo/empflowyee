# Tenant Access Reviews — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/access-control/tenant-access-reviews`; lazy feature `libs/hcm/web/access-control/feature-tenant-access-reviews`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Record manual reviews of snapshotted account-role assignments without claiming continuous certification. Use the domain DTO projection, not SELECT * or entity serialization.
q matches review label; status filter; createdAt desc/asc then id. Items sort id asc, filter decision; no recursive client filtering.

Start a review with label/reason and snapshot current assignment occurrences and account/role revisions.

## API

All DTOs/validation belong to `hcm-access-control-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-ACCESS-CONTROL.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                                         | Permission                          | Request                                              | Response              |
| ----------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- | --------------------- |
| `GET /api/v1/access-control/reviews`                              | `hcm.access-control.reviews.read`   | `List query`                                         | `Page<ReviewSummary>` |
| `GET /api/v1/access-control/reviews/{id}/items`                   | `hcm.access-control.reviews.read`   | `List query: decision?`                              | `Page<ReviewItem>`    |
| `POST /api/v1/access-control/reviews`                             | `hcm.access-control.reviews.manage` | `{label,reason}`                                     | `ReviewSummary`       |
| `POST /api/v1/access-control/reviews/{id}/items/{itemId}/decide`  | `hcm.access-control.reviews.manage` | `{decision:Retain / Revoke,expectedRevision,reason}` | `ReviewItem`          |
| `POST /api/v1/access-control/reviews/{id}/items/{itemId}/refresh` | `hcm.access-control.reviews.manage` | `{expectedRevision,reason}`                          | `ReviewItem`          |
| `POST /api/v1/access-control/reviews/{id}/close`                  | `hcm.access-control.reviews.manage` | `{expectedRevision,reason}`                          | `ReviewSummary`       |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Retain/revoke a pending item with reason; stale snapshots require explicit refresh. Revoke uses protected grant rules.

Forms use the shared Signal Forms protocol, Create label/reason; single-item decision and refresh confirmations; native page transitions between list and review items with Back. No scheduled campaign or bulk certification.

Revoke/regrant same pair is detected through grantId; last-admin revoke fails without marking item decided.

## RULES

Close only after every item is decided and retained evidence still matches; clearly show snapshot time and out-of-scope later grants.

Retained grant changes prevent closure until refreshed/re-decided; Closed review is read-only.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-ACCESS-CONTROL.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.access-control`. Discovery remains
`hcm.catalogue.TENANT_ACCESS_REVIEWS.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission                 | Authorized function                                                  |
| ----------------------------------- | -------------------------------------------------------------------- |
| `hcm.access-control.reviews.read`   | List reviews and snapshots                                           |
| `hcm.access-control.reviews.manage` | Start/decide/refresh/close reviews with same grant-revocation policy |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `access_review` — owned by access-control; this app uses the owning domain contract.
- `access_review_item` — owned by access-control; this app uses the owning domain contract.
- `account_role` — owned by access-control; this app uses the owning domain contract.
- `access_command_receipt` — owned by access-control; this app uses the owning domain contract.

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

Content columns/fields: Review label/status/created date; detail account/role labels, decision, stale flag, reason.

Table declaration: mode **server**. q matches review label; status filter; createdAt desc/asc then id. Items sort id asc, filter decision; no recursive client filtering.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Create label/reason; single-item decision and refresh confirmations; native page transitions between list and review items with Back. No scheduled campaign or bulk certification.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                                | Root                                                        | Tags                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hcm-web-access-control-feature-tenant-access-reviews` | `libs/hcm/web/access-control/feature-tenant-access-reviews` | `product:hcm`, `runtime:web`, `domain:access-control`, `type:feature`        |
| `hcm-web-access-control-data-access`                   | `libs/hcm/web/access-control/data-access`                   | `product:hcm`, `runtime:web`, `domain:access-control`, `type:data-access`    |
| `hcm-access-control-contract`                          | `libs/hcm/contracts/access-control`                         | `product:hcm`, `runtime:universal`, `domain:access-control`, `type:contract` |
| `hcm-api-access-control-domain`                        | `libs/hcm/api/access-control/domain`                        | `product:hcm`, `runtime:api`, `domain:access-control`, `type:domain`         |
| `hcm-api-access-control-application`                   | `libs/hcm/api/access-control/application`                   | `product:hcm`, `runtime:api`, `domain:access-control`, `type:application`    |
| `hcm-api-access-control-infrastructure`                | `libs/hcm/api/access-control/infrastructure`                | `product:hcm`, `runtime:api`, `domain:access-control`, `type:infrastructure` |
| `hcm-api-access-control-transport`                     | `libs/hcm/api/access-control/transport`                     | `product:hcm`, `runtime:api`, `domain:access-control`, `type:transport`      |
| `hcm-api-access-control-module`                        | `libs/hcm/api/access-control/module`                        | `product:hcm`, `runtime:api`, `domain:access-control`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Access assignment policy, audit and account/role revisions; review commands advance the parent revision as well as affected item revision.

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

Branch `codex/hcm-1-tenant-access-reviews` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
