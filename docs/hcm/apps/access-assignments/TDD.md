# Access Assignments — technical design

Status: admitted local-stage implementation; UX reconciled with the explicit 2026-09-24 owner instruction.

## ROUTE

Selected route `/access-control/access-assignments`; lazy feature `libs/hcm/web/access-control/feature-access-assignments`. The blueprint selects the implementation. Canonical status remains Planned until runtime acceptance passes. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Inspect account roles and grant or revoke one role at a time with attributable reasons. Use the domain DTO projection, not SELECT * or entity serialization.
q matches account displayName/email; enabled filter; sort displayName asc/desc then id.

Read tenant accounts and their current roles from the database; disabled accounts remain visible to administrators.

## API

All DTOs/validation belong to `hcm-access-control-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-ACCESS-CONTROL.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                                    | Permission                              | Request                                    | Response                      |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------ | ----------------------------- |
| `GET /api/v1/access-control/assignments`                     | `hcm.access-control.assignments.read`   | `List query`                               | `Page<AssignmentSummary>`     |
| `GET /api/v1/access-control/assignments/{accountId}`         | `hcm.access-control.assignments.read`   | none                                       | `AssignmentSummary`           |
| `GET /api/v1/access-control/assignments/{accountId}/roles`   | `hcm.access-control.assignments.read`   | `List query`                               | `Page<{id,label,grantId}>`    |
| `GET /api/v1/access-control/assignment-role-options`         | `hcm.access-control.assignments.manage` | `List query: q label`                      | `Page<{id,label,systemRole}>` |
| `POST /api/v1/access-control/assignments/{accountId}/grant`  | `hcm.access-control.assignments.manage` | `{roleId,expectedRevision,reason}`         | `AssignmentSummary`           |
| `POST /api/v1/access-control/assignments/{accountId}/revoke` | `hcm.access-control.assignments.manage` | `{roleId,grantId,expectedRevision,reason}` | `AssignmentSummary`           |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Select an existing account and role, confirm the exact target and reason; update only that assignment and advance account revision.

Forms use the shared Signal Forms protocol, Read-only account identity; a server-paginated role picker and required reason. Grant/Revoke use native confirmation dialogs; no mass replace or bulk action.

Grant/revoke persists after reload; duplicate grant is conflict unless identical receipt replay.

## RULES

Reject removal of the final enabled protected administrator; role changes affect the next verified request.

Race two final-admin revokes and an account disable; invariant holds and prior-context browser caches clear.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-ACCESS-CONTROL.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.access-control`. Discovery remains
`hcm.catalogue.ACCESS_ASSIGNMENTS.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission                     | Authorized function                               |
| --------------------------------------- | ------------------------------------------------- |
| `hcm.access-control.assignments.read`   | Read account assignment projections               |
| `hcm.access-control.assignments.manage` | Grant/revoke roles with protected-admin invariant |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `account_role` — owned by access-control; this app uses the owning domain contract.
- `user_account` — owned by identity-access; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `access_role` — owned by access-control; this app uses the owning domain contract.
- `access_command_receipt` — owned by access-control; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-ACCESS-CONTROL.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
Forward migration 000007 grants runtime UPDATE on user_account.revision only. Identity-access retains account ownership; a consumer-owned account projection/revision port binds to the same tenant transaction. Existing seeded accounts/grants suffice; no fabricated seed history is added.

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Keep the account filter/list in the begin column, with a mid-column shared Object Page (COMPOSED) containing Overview and Roles. Account selection is a query parameter and survives reload. Grant/revoke are focused native dialogs with an explicit account, server-paginated role picker and reason.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection, subject to the mandatory [UX matrix](../../roadmap/HCM-1-UX-REVISION.md). No feature CSS or custom floorplan.

Content columns/fields: Account display name; email; enabled state; role labels; revision.

Table declaration: mode **server**. q matches account displayName/email; enabled filter; sort displayName asc/desc then id.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Read-only account identity; a server-paginated role picker and required reason. Grant/Revoke use native confirmation dialogs; no mass replace or bulk action.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                             | Root                                                     | Tags                                                                         |
| --------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hcm-web-access-control-feature-access-assignments` | `libs/hcm/web/access-control/feature-access-assignments` | `product:hcm`, `runtime:web`, `domain:access-control`, `type:feature`        |
| `hcm-web-access-control-data-access`                | `libs/hcm/web/access-control/data-access`                | `product:hcm`, `runtime:web`, `domain:access-control`, `type:data-access`    |
| `hcm-access-control-contract`                       | `libs/hcm/contracts/access-control`                      | `product:hcm`, `runtime:universal`, `domain:access-control`, `type:contract` |
| `hcm-api-access-control-domain`                     | `libs/hcm/api/access-control/domain`                     | `product:hcm`, `runtime:api`, `domain:access-control`, `type:domain`         |
| `hcm-api-access-control-application`                | `libs/hcm/api/access-control/application`                | `product:hcm`, `runtime:api`, `domain:access-control`, `type:application`    |
| `hcm-api-access-control-infrastructure`             | `libs/hcm/api/access-control/infrastructure`             | `product:hcm`, `runtime:api`, `domain:access-control`, `type:infrastructure` |
| `hcm-api-access-control-transport`                  | `libs/hcm/api/access-control/transport`                  | `product:hcm`, `runtime:api`, `domain:access-control`, `type:transport`      |
| `hcm-api-access-control-module`                     | `libs/hcm/api/access-control/module`                     | `product:hcm`, `runtime:api`, `domain:access-control`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Reuses access-control invariant and identity account revision, never a second assignment writer.

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

Branch `codex/hcm-1-access-assignments` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. Implementation is authorized by the product owner’s local-stage and UX instructions. Keep six deferred apps and full-wave completion blocked.

## Implementation reconciliation

The additive single-account GET provides a bounded deep-link projection; it has
the same read permission and tenant scope as the account list. Account IDs are
opaque strings up to 200 characters and must be URL encoded (seed IDs contain
slashes). No identity editing is exposed. Account-role pages sort by role ID;
role choices sort by label then ID. Versioned cursors bind their complete filter,
sort, selected account and page size. Successful command receipts bind the target
account and normalized body in their hash; operation names remain bounded.
Audit actions role.granted/role.revoked target user-account and carry only reason,
roleId and grantId, never account names/emails or permission payloads.
