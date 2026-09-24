# Notification Rules — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/notifications/notification-rules`; lazy feature `libs/hcm/web/notifications/feature-notification-rules`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Enable or disable in-app delivery for supported event types. Use the domain DTO projection, not SELECT * or entity serialization.
Client mode exactly three event rules; no arbitrary conditions, pagination or recipient search.

Show the supported event and its documented recipient resolution; no editable target list.

## API

All DTOs/validation belong to `hcm-notifications-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-NOTIFICATIONS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                     | Permission                       | Request                             | Response            |
| --------------------------------------------- | -------------------------------- | ----------------------------------- | ------------------- |
| `GET /api/v1/notifications/rules`             | `hcm.notifications.rules.read`   | `None`                              | `{items:RuleDto[]}` |
| `PUT /api/v1/notifications/rules/{eventType}` | `hcm.notifications.rules.manage` | `{enabled,expectedRevision,reason}` | `RuleDto`           |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Enable/disable with reason/revision; no external destination, custom condition or new rule type.

Forms use the shared Signal Forms protocol, Single rule Enable/Disable native confirmation with reason; no rule-builder canvas.

Concurrent toggle conflict and unauthorized edits preserve existing rule.

## RULES

A disabled tenant rule suppresses all matching future events; an enabled rule still checks recipient preference.

Preference true does not override disabled rule; prior inbox data remains unchanged.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-NOTIFICATIONS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.notifications`. Discovery remains
`hcm.catalogue.NOTIFICATION_RULES.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission              | Authorized function           |
| -------------------------------- | ----------------------------- |
| `hcm.notifications.rules.read`   | Read supported in-app rules   |
| `hcm.notifications.rules.manage` | Toggle registered event rules |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `notification_rule` — owned by notifications; this app uses the owning domain contract.
- `notification_command_receipt` — owned by notifications; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-NOTIFICATIONS.md#data) and
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

Content columns/fields: Event label; enabled state; fixed recipient explanation; revision.

Table declaration: mode **client**. Client mode exactly three event rules; no arbitrary conditions, pagination or recipient search.
Load the explicitly bounded collection once; filter/sort only that returned collection.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Single rule Enable/Disable native confirmation with reason; no rule-builder canvas.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                            | Root                                                    | Tags                                                                        |
| -------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `hcm-web-notifications-feature-notification-rules` | `libs/hcm/web/notifications/feature-notification-rules` | `product:hcm`, `runtime:web`, `domain:notifications`, `type:feature`        |
| `hcm-web-notifications-data-access`                | `libs/hcm/web/notifications/data-access`                | `product:hcm`, `runtime:web`, `domain:notifications`, `type:data-access`    |
| `hcm-notifications-contract`                       | `libs/hcm/contracts/notifications`                      | `product:hcm`, `runtime:universal`, `domain:notifications`, `type:contract` |
| `hcm-api-notifications-domain`                     | `libs/hcm/api/notifications/domain`                     | `product:hcm`, `runtime:api`, `domain:notifications`, `type:domain`         |
| `hcm-api-notifications-application`                | `libs/hcm/api/notifications/application`                | `product:hcm`, `runtime:api`, `domain:notifications`, `type:application`    |
| `hcm-api-notifications-infrastructure`             | `libs/hcm/api/notifications/infrastructure`             | `product:hcm`, `runtime:api`, `domain:notifications`, `type:infrastructure` |
| `hcm-api-notifications-transport`                  | `libs/hcm/api/notifications/transport`                  | `product:hcm`, `runtime:api`, `domain:notifications`, `type:transport`      |
| `hcm-api-notifications-module`                     | `libs/hcm/api/notifications/module`                     | `product:hcm`, `runtime:api`, `domain:notifications`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Notification delivery outcome contract; external delivery apps remain Planned.

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

Branch `codex/hcm-1-notification-rules` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
