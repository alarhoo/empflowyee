# My Documents — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/documents/my-documents`; lazy feature `libs/hcm/web/documents/feature-my-documents`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Read and download only documents explicitly visible to the current person. Use the domain DTO projection, not SELECT * or entity serialization.
q matches authorized document label; typeId filter; label asc/desc then id; versions versionNumber desc then id. No worker/person selector.

Show only Ready employee-visible versions linked to the verified person, and no hidden-version counts.

## API

All DTOs/validation belong to `hcm-documents-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-DOCUMENTS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                                               | Permission                    | Request               | Response                |
| ----------------------------------------------------------------------- | ----------------------------- | --------------------- | ----------------------- |
| `GET /api/v1/documents/me/documents`                                    | `hcm.documents.self.read`     | `List query: typeId?` | `Page<SelfDocumentDto>` |
| `GET /api/v1/documents/me/documents/{id}`                               | `hcm.documents.self.read`     | `None`                | `SelfDocumentDto`       |
| `GET /api/v1/documents/me/documents/{id}/versions`                      | `hcm.documents.self.read`     | `List query`          | `Page<VersionDto>`      |
| `GET /api/v1/documents/me/documents/{id}/versions/{versionId}/download` | `hcm.documents.self.download` | `None`                | `Attachment bytes`      |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Authorize again on every download; stream attachment only after sensitive-read audit.

No business edit form. Search/filter state still uses Signals and maintained labeled controls; loading/error/denied states never synthesize data.

Revoke sharing after list then download: 404; no stale list authorization bypass.

## RULES

No HR-only templates, unrestricted upload, delete or team documents. Own request submissions stay in Document Requests.

No filename/metadata leak for hidden versions and no implied manager access.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-DOCUMENTS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.documents`. Discovery remains
`hcm.catalogue.MY_DOCUMENTS.discover` and is not any permission below.
Actors and subject scope: Every enabled persona with self-document permission.

| Business permission           | Authorized function                      |
| ----------------------------- | ---------------------------------------- |
| `hcm.documents.self.read`     | List own employee-visible Ready versions |
| `hcm.documents.self.download` | Download own authorized document version |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `employee_document` — owned by documents; this app uses the owning domain contract.
- `employee_document_version` — owned by documents; this app uses the owning domain contract.
- `worker` — owned by workforce-foundation; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `person` — owned by workforce-foundation; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `user_account` — owned by identity-access; this app consumes an explicitly scoped read port/projection and does not take ownership.
- `document_blob` — owned by documents; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-DOCUMENTS.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
SQL and versioned seeds are designed here but not created/run in this delivery.

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. The begin-column HcmDynamicPage keeps server filters/list; the mid-column approved Object Page shows Overview and visible Versions. Selection is a routed document query parameter. No create/edit dialogs or worker selectors.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection, reconciled under the authorized [UX matrix](../../roadmap/HCM-1-UX-REVISION.md). No custom floorplan or feature CSS.

Content columns/fields: Document label/type; visible version; filename; file size; created date.

Table declaration: mode **server**. q matches authorized document label; typeId filter; label asc/desc then id; versions versionNumber desc then id. No worker/person selector.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
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

| Project                                  | Root                                          | Tags                                                                    |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `hcm-web-documents-feature-my-documents` | `libs/hcm/web/documents/feature-my-documents` | `product:hcm`, `runtime:web`, `domain:documents`, `type:feature`        |
| `hcm-web-documents-data-access`          | `libs/hcm/web/documents/data-access`          | `product:hcm`, `runtime:web`, `domain:documents`, `type:data-access`    |
| `hcm-documents-contract`                 | `libs/hcm/contracts/documents`                | `product:hcm`, `runtime:universal`, `domain:documents`, `type:contract` |
| `hcm-api-documents-domain`               | `libs/hcm/api/documents/domain`               | `product:hcm`, `runtime:api`, `domain:documents`, `type:domain`         |
| `hcm-api-documents-application`          | `libs/hcm/api/documents/application`          | `product:hcm`, `runtime:api`, `domain:documents`, `type:application`    |
| `hcm-api-documents-infrastructure`       | `libs/hcm/api/documents/infrastructure`       | `product:hcm`, `runtime:api`, `domain:documents`, `type:infrastructure` |
| `hcm-api-documents-transport`            | `libs/hcm/api/documents/transport`            | `product:hcm`, `runtime:api`, `domain:documents`, `type:transport`      |
| `hcm-api-documents-module`               | `libs/hcm/api/documents/module`               | `product:hcm`, `runtime:api`, `domain:documents`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Worker/account linkage and document sharing/storage policies; self permissions independent of HR roles.

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

Branch `codex/hcm-1-my-documents` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.
