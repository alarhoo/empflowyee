# My Notifications — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/notifications/my-notifications`; lazy feature `libs/hcm/web/notifications/feature-my-notifications`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Read persisted own-account in-app notifications and mark individual items read. Use the domain DTO projection, not SELECT * or entity serialization.
q matches own title/body; unread/eventType filters; createdAt desc/asc then id.

Only persisted notifications addressed to the verified account appear.

## API

All DTOs/validation belong to `hcm-notifications-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-NOTIFICATIONS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                       | Permission                            | Request                          | Response                 |
| ----------------------------------------------- | ------------------------------------- | -------------------------------- | ------------------------ |
| `GET /api/v1/notifications/me/inbox`            | `hcm.notifications.inbox.self.read`   | `List query: unread?,eventType?` | `Page<NotificationItem>` |
| `POST /api/v1/notifications/me/inbox/{id}/read` | `hcm.notifications.inbox.self.manage` | `{expectedRevision}`             | `NotificationItem`       |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Mark an individual item read without deleting it; receipt retry preserves first read timestamp.

Forms use the shared Signal Forms protocol, No create/edit form; native row Mark read action and confirmation-free idempotent state change. Body rendered as text, never innerHTML.

Reload and stale/repeated requests prove correct revision and timestamp behavior.

## RULES

Document-request action is enabled only when its implemented route is discoverable; destination re-authorizes subject.

An inbox before producer/route implementation is honestly empty or informational, never a fake business destination.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-NOTIFICATIONS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.notifications`. Discovery remains
`hcm.catalogue.MY_NOTIFICATIONS.discover` and is not any permission below.
Actors and subject scope: Every enabled persona, own account only.

| Business permission                   | Authorized function        |
| ------------------------------------- | -------------------------- |
| `hcm.notifications.inbox.self.read`   | Read own inbox             |
| `hcm.notifications.inbox.self.manage` | Mark own notification read |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `notification` — owned by notifications; this app uses the owning domain contract.
- `notification_intent` — owned by notifications; this app uses the owning domain contract.
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

Content columns/fields: Title; body preview; event type; created date; read state.

Table declaration: mode **server**. q matches own title/body; unread/eventType filters; createdAt desc/asc then id.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, No create/edit form; native row Mark read action and confirmation-free idempotent state change. Body rendered as text, never innerHTML.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                          | Root                                                  | Tags                                                                        |
| ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `hcm-web-notifications-feature-my-notifications` | `libs/hcm/web/notifications/feature-my-notifications` | `product:hcm`, `runtime:web`, `domain:notifications`, `type:feature`        |
| `hcm-web-notifications-data-access`              | `libs/hcm/web/notifications/data-access`              | `product:hcm`, `runtime:web`, `domain:notifications`, `type:data-access`    |
| `hcm-notifications-contract`                     | `libs/hcm/contracts/notifications`                    | `product:hcm`, `runtime:universal`, `domain:notifications`, `type:contract` |
| `hcm-api-notifications-domain`                   | `libs/hcm/api/notifications/domain`                   | `product:hcm`, `runtime:api`, `domain:notifications`, `type:domain`         |
| `hcm-api-notifications-application`              | `libs/hcm/api/notifications/application`              | `product:hcm`, `runtime:api`, `domain:notifications`, `type:application`    |
| `hcm-api-notifications-infrastructure`           | `libs/hcm/api/notifications/infrastructure`           | `product:hcm`, `runtime:api`, `domain:notifications`, `type:infrastructure` |
| `hcm-api-notifications-transport`                | `libs/hcm/api/notifications/transport`                | `product:hcm`, `runtime:api`, `domain:notifications`, `type:transport`      |
| `hcm-api-notifications-module`                   | `libs/hcm/api/notifications/module`                   | `product:hcm`, `runtime:api`, `domain:notifications`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Notification intent delivery and identity account scope; document producer may arrive later.

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

Branch `codex/hcm-1-my-notifications` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
