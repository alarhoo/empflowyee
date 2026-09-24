# Domain Configuration — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/identity-access/domain-configuration`; lazy feature `libs/hcm/web/identity-access/feature-domain-configuration`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Read the current Account-owned hostname projection used by the HCM runtime. Use the domain DTO projection, not SELECT * or entity serialization.
Bounded projection for current tenant; no search/filter/pagination needed and no external DNS lookup.

Show the exact hostnames/tenant state known to runtime with a source label.

## API

All DTOs/validation belong to `hcm-identity-access-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-IDENTITY-ACCESS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                             | Permission                         | Request | Response           |
| ------------------------------------- | ---------------------------------- | ------- | ------------------ |
| `GET /api/v1/identity-access/domains` | `hcm.identity-access.domains.read` | `None`  | `DomainProjection` |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

No register/verify/remove DNS or tenant lifecycle controls.

No business edit form. Search/filter state still uses Signals and maintained labeled controls; loading/error/denied states never synthesize data.

Mutation requests have no handler; foreign tenant selector is rejected.

## RULES

Missing hostname projection displays an unavailable/empty explanation and retry, not a fake configured state.

Simulate missing projection and DB failure independently; 503 is not converted to an empty success.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-IDENTITY-ACCESS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.identity-access`. Discovery remains
`hcm.catalogue.DOMAIN_CONFIGURATION.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission                | Authorized function               |
| ---------------------------------- | --------------------------------- |
| `hcm.identity-access.domains.read` | Read local domain projection only |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `tenant` — owned by runtime; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `tenant_hostname` — owned by runtime; this app consumes an explicitly scoped read port/projection and does not take ownership.

Use [domain physical design](../../domain/HCM-1-IDENTITY-ACCESS.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
SQL and versioned seeds are designed here but not created/run in this delivery.

## UX

Floorplan `UX-FP-STANDARD-PAGE`, mode **NATIVE**. Use maintained Page directly with Bar/Title in its header; this singleton/bounded settings view needs no collapsing header.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection. No Object Page, generated List Report or custom floorplan.

Content columns/fields: Tenant slug and state; current hostname list; source label Account projection.

Table declaration: mode **client**. Bounded projection for current tenant; no search/filter/pagination needed and no external DNS lookup.
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

| Project                                                | Root                                                        | Tags                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `hcm-web-identity-access-feature-domain-configuration` | `libs/hcm/web/identity-access/feature-domain-configuration` | `product:hcm`, `runtime:web`, `domain:identity-access`, `type:feature`        |
| `hcm-web-identity-access-data-access`                  | `libs/hcm/web/identity-access/data-access`                  | `product:hcm`, `runtime:web`, `domain:identity-access`, `type:data-access`    |
| `hcm-identity-access-contract`                         | `libs/hcm/contracts/identity-access`                        | `product:hcm`, `runtime:universal`, `domain:identity-access`, `type:contract` |
| `hcm-api-identity-access-domain`                       | `libs/hcm/api/identity-access/domain`                       | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:domain`         |
| `hcm-api-identity-access-application`                  | `libs/hcm/api/identity-access/application`                  | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:application`    |
| `hcm-api-identity-access-infrastructure`               | `libs/hcm/api/identity-access/infrastructure`               | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:infrastructure` |
| `hcm-api-identity-access-transport`                    | `libs/hcm/api/identity-access/transport`                    | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:transport`      |
| `hcm-api-identity-access-module`                       | `libs/hcm/api/identity-access/module`                       | `product:hcm`, `runtime:api`, `domain:identity-access`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Existing runtime tenant directory; Account remains authoritative and production synchronization is deferred.

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

Branch `codex/hcm-1-domain-configuration` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
