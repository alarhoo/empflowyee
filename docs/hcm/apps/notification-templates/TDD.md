# Notification Templates — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/notifications/notification-templates`; lazy feature `libs/hcm/web/notifications/feature-notification-templates`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Maintain plain-text in-app templates for the three supported document events. Use the domain DTO projection, not SELECT * or entity serialization.
Client mode over exactly three registered templates; label/eventType sorting only; no pagination or arbitrary template creation.

List one actual configured template per registered event with safe defaults from seed tooling.

## API

All DTOs/validation belong to `hcm-notifications-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-NOTIFICATIONS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                         | Permission                           | Request                                | Response                |
| ------------------------------------------------- | ------------------------------------ | -------------------------------------- | ----------------------- |
| `GET /api/v1/notifications/templates`             | `hcm.notifications.templates.read`   | `None`                                 | `{items:TemplateDto[]}` |
| `PUT /api/v1/notifications/templates/{eventType}` | `hcm.notifications.templates.manage` | `{title,body,expectedRevision,reason}` | `TemplateDto`           |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Edit bounded title/body using requestId/dueDate placeholders; preview text only and save with reason/revision.

Forms use the shared Signal Forms protocol, Native Dialog with Input title and TextArea body, placeholder help, read-only text preview and reason. No expression editor or rich-text component.

Reject unknown placeholders, URL-like external links, tags and control characters; preview never sends.

## RULES

Template edits affect later deliveries, leaving existing inbox bodies unchanged.

Deliver then edit and verify immutable prior inbox content plus audit field-name summary.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-NOTIFICATIONS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.notifications`. Discovery remains
`hcm.catalogue.NOTIFICATION_TEMPLATES.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission                  | Authorized function                        |
| ------------------------------------ | ------------------------------------------ |
| `hcm.notifications.templates.read`   | Read supported templates                   |
| `hcm.notifications.templates.manage` | Edit supported plain-text template content |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `notification_template` — owned by notifications; this app uses the owning domain contract.
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

Content columns/fields: Event label; title; body; revision; allowed placeholder help.

Table declaration: mode **client**. Client mode over exactly three registered templates; label/eventType sorting only; no pagination or arbitrary template creation.
Load the explicitly bounded collection once; filter/sort only that returned collection.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Native Dialog with Input title and TextArea body, placeholder help, read-only text preview and reason. No expression editor or rich-text component.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                                | Root                                                        | Tags                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `hcm-web-notifications-feature-notification-templates` | `libs/hcm/web/notifications/feature-notification-templates` | `product:hcm`, `runtime:web`, `domain:notifications`, `type:feature`        |
| `hcm-web-notifications-data-access`                    | `libs/hcm/web/notifications/data-access`                    | `product:hcm`, `runtime:web`, `domain:notifications`, `type:data-access`    |
| `hcm-notifications-contract`                           | `libs/hcm/contracts/notifications`                          | `product:hcm`, `runtime:universal`, `domain:notifications`, `type:contract` |
| `hcm-api-notifications-domain`                         | `libs/hcm/api/notifications/domain`                         | `product:hcm`, `runtime:api`, `domain:notifications`, `type:domain`         |
| `hcm-api-notifications-application`                    | `libs/hcm/api/notifications/application`                    | `product:hcm`, `runtime:api`, `domain:notifications`, `type:application`    |
| `hcm-api-notifications-infrastructure`                 | `libs/hcm/api/notifications/infrastructure`                 | `product:hcm`, `runtime:api`, `domain:notifications`, `type:infrastructure` |
| `hcm-api-notifications-transport`                      | `libs/hcm/api/notifications/transport`                      | `product:hcm`, `runtime:api`, `domain:notifications`, `type:transport`      |
| `hcm-api-notifications-module`                         | `libs/hcm/api/notifications/module`                         | `product:hcm`, `runtime:api`, `domain:notifications`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

In-app event registry and validated rendering port; templates cannot add recipients/channels.

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

Branch `codex/hcm-1-notification-templates` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
