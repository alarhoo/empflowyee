# Sensitive Access Log — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/audit/sensitive-access-log`; lazy feature `libs/hcm/web/audit/feature-sensitive-access-log`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Inspect document access metadata without granting document-content access. Use the domain DTO projection, not SELECT * or entity serialization.
Server from/to/action/outcome filters; sort occurredAt desc (default) or asc then id. No free-text q for logs; reject unsupported q instead of searching arbitrary JSON.

Inspect document access metadata without granting document-content access. Rows come from the append-only store with safe DTO projection.

## API

All DTOs/validation belong to `hcm-audit-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-AUDIT.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                            | Permission                        | Request                                                   | Response                    |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------- | --------------------------- |
| `GET /api/v1/audit/sensitive-access` | `hcm.audit.sensitive-access.read` | `List query: from?,to?,action?,outcome?; actorAccountId?` | `Page<SensitiveAccessItem>` |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Filter and paginate using stable event ordering; no raw payload, document body or credential fields.

No business edit form. Search/filter state still uses Signals and maintained labeled controls; loading/error/denied states never synthesize data.

Test date boundaries, equal timestamps, malformed cursors and forbidden summary keys.

## RULES

Unknown stream completion is shown honestly, never as a completed download.

No seeded fictional history appears as actual activity; no edit/delete/export action exists.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-AUDIT.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.audit`. Discovery remains
`hcm.catalogue.SENSITIVE_ACCESS_LOG.discover` and is not any permission below.
Actors and subject scope: Tenant administrators.

| Business permission               | Authorized function                                                        |
| --------------------------------- | -------------------------------------------------------------------------- |
| `hcm.audit.sensitive-access.read` | Inspect document access metadata without granting document-content access. |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `audit_event` — owned by audit; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-AUDIT.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
SQL and versioned seeds are designed here but not created/run in this delivery.

## UX

Floorplan `UX-FP-DYNAMIC-PAGE`, mode **NATIVE**. Use existing HcmDynamicPage with persistent title/actions and collapsible filter/scope context; the responsive native table displays the complete safe projection. There is no separate object detail workflow or dialog.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection. No Object Page, generated List Report or custom floorplan.

Content columns/fields: Actor; document target ID; authorization/stream phase; related event; timestamp.

Table declaration: mode **server**. Server from/to/action/outcome filters; sort occurredAt desc (default) or asc then id. No free-text q for logs; reject unsupported q instead of searching arbitrary JSON.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Read-only rows have no separate object-selection workflow; no bulk actions, column personalization,
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

| Project                                      | Root                                              | Tags                                                                |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `hcm-web-audit-feature-sensitive-access-log` | `libs/hcm/web/audit/feature-sensitive-access-log` | `product:hcm`, `runtime:web`, `domain:audit`, `type:feature`        |
| `hcm-web-audit-data-access`                  | `libs/hcm/web/audit/data-access`                  | `product:hcm`, `runtime:web`, `domain:audit`, `type:data-access`    |
| `hcm-audit-contract`                         | `libs/hcm/contracts/audit`                        | `product:hcm`, `runtime:universal`, `domain:audit`, `type:contract` |
| `hcm-api-audit-domain`                       | `libs/hcm/api/audit/domain`                       | `product:hcm`, `runtime:api`, `domain:audit`, `type:domain`         |
| `hcm-api-audit-application`                  | `libs/hcm/api/audit/application`                  | `product:hcm`, `runtime:api`, `domain:audit`, `type:application`    |
| `hcm-api-audit-infrastructure`               | `libs/hcm/api/audit/infrastructure`               | `product:hcm`, `runtime:api`, `domain:audit`, `type:infrastructure` |
| `hcm-api-audit-transport`                    | `libs/hcm/api/audit/transport`                    | `product:hcm`, `runtime:api`, `domain:audit`, `type:transport`      |
| `hcm-api-audit-module`                       | `libs/hcm/api/audit/module`                       | `product:hcm`, `runtime:api`, `domain:audit`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

The reader selects only the three approved document stream actions. Authorization
rows remain Authorized, never inferred Completed. Completion rows explicitly link
their authorization event and show only the observed server outcome. The UI
explains that authorization alone does not establish completion or client receipt.
No document contents, filename, payload summary or content-access link is exposed.
Payload-derived summary has no approved sensitive-action fields and is empty.
The later document slice adds the real producers through the shared audit port.

## DEPENDENCIES

Audit append store; document download event producers may be implemented later.

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

Branch `codex/hcm-1-sensitive-access-log` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
