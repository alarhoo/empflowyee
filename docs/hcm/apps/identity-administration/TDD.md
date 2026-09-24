# Identity Administration — technical design

Status: approved local implementation scope, reconciled with the mandatory UX matrix under the explicit implementation instruction.

## ROUTE

Selected route `/identity-access/identity-administration`; lazy feature `libs/hcm/web/identity-access/feature-identity-administration`. The blueprint selects the implementation route and floorplan; keep implementationStatus Planned until acceptance passes. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Manage enabled local account records linked to existing people without creating authentication credentials. Use the domain DTO projection, not SELECT * or entity serialization.
q matches displayName/email; enabled filter; displayName asc/desc then id.

List real person-linked accounts without changing workforce information.

## API

All DTOs/validation belong to `hcm-identity-access-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-IDENTITY-ACCESS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                            | Permission                            | Request                             | Response                 |
| ---------------------------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------ |
| `GET /api/v1/identity-access/accounts`               | `hcm.identity-access.accounts.read`   | `List query`                        | `Page<AccountSummary>`   |
| `GET /api/v1/identity-access/accounts/{id}`          | `hcm.identity-access.accounts.read`   | `None`                              | `AccountSummary`         |
| `GET /api/v1/identity-access/account-person-options` | `hcm.identity-access.accounts.manage` | `List query: q displayName`         | `Page<{id,displayName}>` |
| `POST /api/v1/identity-access/accounts`              | `hcm.identity-access.accounts.manage` | `{personId,email,reason}`           | `AccountSummary`         |
| `POST /api/v1/identity-access/accounts/{id}/enabled` | `hcm.identity-access.accounts.manage` | `{enabled,expectedRevision,reason}` | `AccountSummary`         |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Select an existing tenant person and unique email; create enabled account with no roles, invitation or persona.

Forms use the shared Signal Forms protocol, Create dialog: person picker, email, reason. Existing identity fields read-only; Enable/Disable confirmation only. No email edit, relink, credential or delete controls.

Foreign/missing person and case-insensitive duplicate email fail; reload verifies real persistence.

## RULES

Change enabled with a reason and revision while retaining roles/history; last administrator is protected.

Disabled persona fails the next request; enabling never silently grants permissions or changes employment.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-IDENTITY-ACCESS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.identity-access`. Discovery remains
`hcm.catalogue.IDENTITY_ADMINISTRATION.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission                   | Authorized function                                   |
| ------------------------------------- | ----------------------------------------------------- |
| `hcm.identity-access.accounts.read`   | Read tenant accounts                                  |
| `hcm.identity-access.accounts.manage` | Create account for existing person and enable/disable |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `user_account` — owned by identity-access; this app uses the owning domain contract.
- `person (read-only workforce projection)` — owned by workforce-foundation; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `identity_command_receipt` — owned by identity-access; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-IDENTITY-ACCESS.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
Apply additive SQL migration 000008 through the explicit database tool; existing versioned Dunder Mifflin people/accounts provide real data. Do not invent accounts or audit history in seed fixtures.

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Keep account filters/table in a begin-column HcmDynamicPage; selected account opens a mid-column HcmObjectPage with Overview and contextual Roles sections. Selection uses an encoded account query parameter and native query-change leave guards. Three-field creation and reasoned enable/disable are focused native dialogs.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection. No custom layout or business CSS. Contextual Roles consumes the existing Access Assignments read API only when its distinct permission/entitlement is present, with a link to that owning app for grant/revoke. Identity does not duplicate assignment logic.

Content columns/fields: Display name; email; enabled state; person linkage; revision.

Table declaration: mode **server**. q matches displayName/email; enabled filter; displayName asc/desc then id.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Create dialog: person picker, email, reason. Existing identity fields read-only; Enable/Disable confirmation only. No email edit, relink, credential or delete controls.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                                   | Root                                                           | Tags                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `hcm-web-identity-access-feature-identity-administration` | `libs/hcm/web/identity-access/feature-identity-administration` | `product:hcm`, `runtime:web`, `domain:identity-access`, `type:feature`        |
| `hcm-web-identity-access-data-access`                     | `libs/hcm/web/identity-access/data-access`                     | `product:hcm`, `runtime:web`, `domain:identity-access`, `type:data-access`    |
| `hcm-identity-access-contract`                            | `libs/hcm/contracts/identity-access`                           | `product:hcm`, `runtime:universal`, `domain:identity-access`, `type:contract` |
| `hcm-api-identity-access-domain`                          | `libs/hcm/api/identity-access/domain`                          | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:domain`         |
| `hcm-api-identity-access-application`                     | `libs/hcm/api/identity-access/application`                     | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:application`    |
| `hcm-api-identity-access-infrastructure`                  | `libs/hcm/api/identity-access/infrastructure`                  | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:infrastructure` |
| `hcm-api-identity-access-transport`                       | `libs/hcm/api/identity-access/transport`                       | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:transport`      |
| `hcm-api-identity-access-module`                          | `libs/hcm/api/identity-access/module`                          | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Identity unit of work calls the access-control invariant under the same tenant lock.

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

Branch `codex/hcm-1-identity-administration` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. Application code is authorized by the subsequent local-stage implementation instruction; this reconciliation introduces no new business behavior. Keep six deferred apps and full-wave completion blocked.
