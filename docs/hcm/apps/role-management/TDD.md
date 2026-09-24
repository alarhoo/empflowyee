# Role Management — technical design

Status: admitted local-stage implementation; the product-owner UX revision is recorded in DECISIONS.md.

## ROUTE

Route `/access-control/role-management`; lazy domain feature `libs/hcm/web/access-control/feature-role-management`. The feature owns its `new` and `:id/edit` routes, selection query state and dirty-leave guards. Canonical metadata selects FCL; source ownership remains access-control.

## READ

Inspect system roles and maintain custom tenant roles from registered permissions. Use the domain DTO projection, not SELECT * or entity serialization.
q matches label; filter systemRole; sort label asc (default) or desc, then id.

Opening shows persisted seeded roles and registered discovery/business permissions without treating discovery as authorization.

## API

All DTOs/validation belong to `hcm-access-control-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-ACCESS-CONTROL.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                       | Permission                        | Request                                                    | Response                     |
| ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| `GET /api/v1/access-control/roles`              | `hcm.access-control.roles.read`   | `List query`                                               | `Page<RoleSummary>`          |
| `GET /api/v1/access-control/roles/{id}`         | `hcm.access-control.roles.read`   | `None`                                                     | `RoleDetail`                 |
| `GET /api/v1/access-control/permissions`        | `hcm.access-control.roles.read`   | `kind?; bounded registered collection`                     | `{items:PermissionOption[]}` |
| `POST /api/v1/access-control/roles`             | `hcm.access-control.roles.manage` | `{label,permissionCodes:string[],reason}`                  | `RoleDetail`                 |
| `PUT /api/v1/access-control/roles/{id}`         | `hcm.access-control.roles.manage` | `{label,permissionCodes:string[],expectedRevision,reason}` | `RoleDetail`                 |
| `POST /api/v1/access-control/roles/{id}/delete` | `hcm.access-control.roles.manage` | `{expectedRevision,reason}`                                | `{id,deleted:true}`          |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Create/edit a non-system role with a trimmed unique label and registered permission codes; saving with a reason returns the new revision.

Forms use the shared Signal Forms protocol, Label and permission multiselection; permission options grouped by kind, exact code/description visible; required reason. Create/Edit use dedicated routed Dynamic Pages (`new` and `:id/edit`) for the substantial permission editor. Dirty Cancel/leave confirms before discarding. No system-role mutation controls.

Create, reload and edit a custom role; reject duplicate label, unknown permission and stale revision.

## RULES

System roles cannot be edited/deleted; an assigned custom role cannot be deleted.

Attempt protected edits, flag injection and deletion of an assigned role; no row or audit success is committed.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-ACCESS-CONTROL.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.access-control`. Discovery remains
`hcm.catalogue.ROLE_MANAGEMENT.discover` and is not any permission below.
Actors and subject scope: Tenant administrators (David through persisted grants).

| Business permission               | Authorized function                                            |
| --------------------------------- | -------------------------------------------------------------- |
| `hcm.access-control.roles.read`   | Read roles and registered permission options                   |
| `hcm.access-control.roles.manage` | Create/edit/delete unassigned custom roles; never system roles |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `access_role` — owned by access-control; this app uses the owning domain contract.
- `access_permission` — owned by access-control; this app uses the owning domain contract.
- `role_permission` — owned by access-control; this app uses the owning domain contract.
- `account_role` — owned by access-control; this app uses the owning domain contract.
- `access_command_receipt` — owned by access-control; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-ACCESS-CONTROL.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
This slice reuses the explicitly applied access/audit foundation migration and seeds; contextual reads require no new migration.

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**, using installed `FlexibleColumnLayout` from `@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout` (0.64.3 / UI5 2.26.0). The begin (`startColumn`) is HcmDynamicPage with filters and the server-owned role table. Selection is the `role` query parameter and opens `HcmObjectPage` (`UX-FP-OBJECT-PAGE`, COMPOSED) in `midColumn` with Overview, Permissions, Assignees, History / Audit. Native FCL owns responsive columns; Back to roles restores the begin column on phones. Both columns are page-backed. No feature CSS.

The [product-owner revision](DECISIONS.md#ux-revision) supersedes the earlier dialog-only choice and the common TDD's exclusion of Object Page for this screen. Shared Object Page acceptance must pass before completing adoption. Native TabContainer replaces the historical Platform tabs; semantic definition lists present static values without cross-shadow UI5 Display Form semantics. Interactive forms retain native Form in Edit mode and Signal Forms.

Create/edit use dedicated feature routes. Only delete/reason and dirty-discard confirmations use dialogs. Existing role HTTP commands remain unchanged.

Contextual reads add `GET roles/{id}/assignees` and `GET roles/{id}/history`, with only `limit` (25 default, 100 maximum) and `cursor`. Both require roles.read plus respectively assignments.read/access-control entitlement or audit.events.read/audit entitlement. Their cursors are role-bound. Missing role is 404 after authorization. History returns `Page<{id,occurredAt,actorAccountId,action,outcome,summary:{reason,changedFields}}>` of actual role mutation events only; assignees return `Page<{accountId,displayName,email,enabled,grantId}>`. No synthetic seed history.

Role Management owns no assignment command logic. Assignees use the shared assignment-owned query service; history uses the audit-owned projection adapter. Assignment actions reuse ACCESS_ASSIGNMENTS contracts/services or navigate to that app. Independent section loading/empty/denied/error states preserve a valid role overview.

Content columns/fields: Role label; system/protected status; permission count; assignee count; revision.

Table declaration: mode **server**. q matches label; filter systemRole; sort label asc (default) or desc, then id.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Label and permission multiselection; permission options grouped by kind, exact code/description visible; required reason. Create/Edit use dedicated routed Dynamic Pages (`new` and `:id/edit`) for the substantial permission editor. Dirty Cancel/leave confirms before discarding. No system-role mutation controls.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Admitted project declarations. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                          | Root                                                  | Tags                                                                         |
| ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hcm-web-access-control-feature-role-management` | `libs/hcm/web/access-control/feature-role-management` | `product:hcm`, `runtime:web`, `domain:access-control`, `type:feature`        |
| `hcm-web-access-control-data-access`             | `libs/hcm/web/access-control/data-access`             | `product:hcm`, `runtime:web`, `domain:access-control`, `type:data-access`    |
| `hcm-access-control-contract`                    | `libs/hcm/contracts/access-control`                   | `product:hcm`, `runtime:universal`, `domain:access-control`, `type:contract` |
| `hcm-api-access-control-domain`                  | `libs/hcm/api/access-control/domain`                  | `product:hcm`, `runtime:api`, `domain:access-control`, `type:domain`         |
| `hcm-api-access-control-application`             | `libs/hcm/api/access-control/application`             | `product:hcm`, `runtime:api`, `domain:access-control`, `type:application`    |
| `hcm-api-access-control-infrastructure`          | `libs/hcm/api/access-control/infrastructure`          | `product:hcm`, `runtime:api`, `domain:access-control`, `type:infrastructure` |
| `hcm-api-access-control-transport`               | `libs/hcm/api/access-control/transport`               | `product:hcm`, `runtime:api`, `domain:access-control`, `type:transport`      |
| `hcm-api-access-control-module`                  | `libs/hcm/api/access-control/module`                  | `product:hcm`, `runtime:api`, `domain:access-control`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Access policy and audit append contracts must be implemented before exposing any write.

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

Branch `codex/hcm-1-role-object-page` carries the product-owner UX correction. Keep contracts/context projections, shared floorplan corrections and routed native UI in coherent commits. Run API/RLS, unit, browser, Storybook, architecture and readiness gates. Access Assignments follows on its own branch; six deferred apps remain Planned.
