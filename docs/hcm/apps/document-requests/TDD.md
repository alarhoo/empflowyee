# Document Requests — technical design

Status: complete for review; no implementation/admission or revision approval claimed.

## ROUTE

Selected route `/documents/document-requests`; lazy feature `libs/hcm/web/documents/feature-document-requests`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Request a file from a worker, accept a submission or request replacement using the approved manual lifecycle. Use the domain DTO projection, not SELECT * or entity serialization.
q matches request ID only; status/typeId/workerId filters on HR endpoint, status only on self; createdAt desc/asc then id; submissions versionNumber desc then id.

HR selects existing worker/type and optional due date; creates Open request and in-app requested event.

## API

All DTOs/validation belong to `hcm-documents-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-DOCUMENTS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                                                 | Permission                             | Request                                           | Response                            |
| ------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| `GET /api/v1/documents/requests`                                          | `hcm.documents.requests.read`          | `List query: workerId?,status?,typeId?`           | `Page<RequestDto>`                  |
| `GET /api/v1/documents/requests/{id}`                                     | `hcm.documents.requests.read`          | `None`                                            | `RequestDto`                        |
| `GET /api/v1/documents/request-worker-options`                            | `hcm.documents.requests.manage`        | `List query: q displayName/workerCode`            | `Page<{id,displayName,workerCode}>` |
| `GET /api/v1/documents/request-type-options`                              | `hcm.documents.requests.manage`        | `List query: enabled=true`                        | `Page<{id,code,label}>`             |
| `GET /api/v1/documents/requests/{id}/submissions`                         | `hcm.documents.requests.read`          | `List query`                                      | `Page<VersionDto>`                  |
| `POST /api/v1/documents/requests`                                         | `hcm.documents.requests.manage`        | `{workerId,typeId,instructions?,dueDate?,reason}` | `RequestDto`                        |
| `POST /api/v1/documents/requests/{id}/accept`                             | `hcm.documents.requests.manage`        | `{submissionId,expectedRevision,reason}`          | `RequestDto`                        |
| `POST /api/v1/documents/requests/{id}/replacement`                        | `hcm.documents.requests.manage`        | `{expectedRevision,reason}`                       | `RequestDto`                        |
| `POST /api/v1/documents/requests/{id}/cancel`                             | `hcm.documents.requests.manage`        | `{expectedRevision,reason}`                       | `RequestDto`                        |
| `GET /api/v1/documents/me/requests`                                       | `hcm.documents.requests.self.read`     | `List query: status?`                             | `Page<SelfRequestDto>`              |
| `GET /api/v1/documents/me/requests/{id}`                                  | `hcm.documents.requests.self.read`     | `None`                                            | `SelfRequestDto`                    |
| `GET /api/v1/documents/me/requests/{id}/submissions`                      | `hcm.documents.requests.self.read`     | `List query`                                      | `Page<VersionDto>`                  |
| `POST /api/v1/documents/me/requests/{id}/submit`                          | `hcm.documents.requests.self.submit`   | `multipart: metadata {expectedRevision}, file`    | `SelfRequestDto`                    |
| `GET /api/v1/documents/requests/{id}/submissions/{versionId}/download`    | `hcm.documents.requests.download`      | `None`                                            | `Attachment bytes`                  |
| `GET /api/v1/documents/me/requests/{id}/submissions/{versionId}/download` | `hcm.documents.requests.self.download` | `None`                                            | `Attachment bytes`                  |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Addressed employee submits validated file only while Open; HR accepts Submitted or requests replacement with reason.

Forms use the shared Signal Forms protocol, One domain feature with server-authorized Own requests and HR tenant scopes. Native controls show only permitted actions; a dedicated routed create form, focused transition dialogs and employee FileUploader. No generic workflow builder.

Open->Submitted->Completed and Submitted->Open paths persist exactly one event/version per receipt; foreign submitter denied.

## RULES

HR cancels Open/Submitted with reason; terminal states cannot be reopened. Previous submissions remain visible to their subject/HR.

Race cancel/submit or accept/replacement under revision; terminal writes fail with no partial file/business success.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-DOCUMENTS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.documents`. Discovery remains
`hcm.catalogue.DOCUMENT_REQUESTS.discover` and is not any permission below.
Actors and subject scope: HR Operations manages tenant requests; all personas can read and submit only requests addressed to their own person.

| Business permission                    | Authorized function                    |
| -------------------------------------- | -------------------------------------- |
| `hcm.documents.requests.read`          | HR tenant request read                 |
| `hcm.documents.requests.manage`        | HR create/accept/replace/cancel        |
| `hcm.documents.requests.self.read`     | Read own addressed request/submissions |
| `hcm.documents.requests.self.submit`   | Submit to own Open request             |
| `hcm.documents.requests.download`      | HR download request submission         |
| `hcm.documents.requests.self.download` | Download own request submissions       |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `document_request` — owned by documents; this app uses the owning domain contract.
- `document_request_submission` — owned by documents; this app uses the owning domain contract.
- `document_type` — owned by documents; this app uses the owning domain contract.
- `document_blob` — owned by documents; this app uses the owning domain contract.
- `document_upload_attempt` — owned by documents; this app uses the owning domain contract.
- `document_command_receipt` — owned by documents; this app uses the owning domain contract.

Use [domain physical design](../../domain/HCM-1-DOCUMENTS.md#data) and
[SQL/RLS standards](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#sql). Do not create duplicate
tables per app. Forward migrations shared by sibling apps are delivered once by
their owning domain. Read-only apps add no mutation grants just to populate a UI.
Successful writes use the [shared unit of work](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#tx).
SQL and versioned seeds are designed here but not created/run in this delivery.

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Keep scope/filter/list in a begin-column HcmDynamicPage and selected request in the mid-column approved Object Page with Overview and Submissions. Route complex creation to `/documents/document-requests/create`; focused submit/accept/replacement/cancel actions use native dialogs. Selection and scope are deep-linkable.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection, reconciled under the authorized [UX matrix](../../roadmap/HCM-1-UX-REVISION.md). No custom floorplan or feature CSS.

Content columns/fields: Request ID; worker (HR only); type; status; due date; latest submission; revision.

Table declaration: mode **server**. q matches request ID only; status/typeId/workerId filters on HR endpoint, status only on self; createdAt desc/asc then id; submissions versionNumber desc then id.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, One domain feature with server-authorized Own requests and HR tenant scopes. Native controls show only permitted actions; a dedicated routed create form, focused transition dialogs and employee FileUploader. No generic workflow builder.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                       | Root                                               | Tags                                                                    |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `hcm-web-documents-feature-document-requests` | `libs/hcm/web/documents/feature-document-requests` | `product:hcm`, `runtime:web`, `domain:documents`, `type:feature`        |
| `hcm-web-documents-data-access`               | `libs/hcm/web/documents/data-access`               | `product:hcm`, `runtime:web`, `domain:documents`, `type:data-access`    |
| `hcm-documents-contract`                      | `libs/hcm/contracts/documents`                     | `product:hcm`, `runtime:universal`, `domain:documents`, `type:contract` |
| `hcm-api-documents-domain`                    | `libs/hcm/api/documents/domain`                    | `product:hcm`, `runtime:api`, `domain:documents`, `type:domain`         |
| `hcm-api-documents-application`               | `libs/hcm/api/documents/application`               | `product:hcm`, `runtime:api`, `domain:documents`, `type:application`    |
| `hcm-api-documents-infrastructure`            | `libs/hcm/api/documents/infrastructure`            | `product:hcm`, `runtime:api`, `domain:documents`, `type:infrastructure` |
| `hcm-api-documents-transport`                 | `libs/hcm/api/documents/transport`                 | `product:hcm`, `runtime:api`, `domain:documents`, `type:transport`      |
| `hcm-api-documents-module`                    | `libs/hcm/api/documents/module`                    | `product:hcm`, `runtime:api`, `domain:documents`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

Document staged storage, audit and synchronous notification ports; add employee catalogue membership/placement only after TDD review.

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

Branch `codex/hcm-1-document-requests` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.

## DISCOVERY

This app currently has only HR catalogue placement. Its approved own-request
behavior also needs employee discovery. At implementation admission, add the same
app code to `employee-self-service` and placement `{spaceId: employee, pageId:
employee-lifecycle, sectionId: employee-documents-compliance, display: tiles}`.
These existing IDs were inspected in canonical hcm-launchpad.json on 2026-09-24. Do not clone a feature or
grant HR business permissions. Seed the discovery permission for Employee, Manager
and Administrator own-person use, while retaining HR placement. The API self
contract remains authoritative even when navigating from an inbox deep link.

Select HR tenant scope initially when requests.read is granted, otherwise Own
requests when requests.self.read is granted. Show a native scope selector only
when both are granted; changing scope cancels pending requests and resets query
state. No HR collection request runs for a self-only actor. If neither entry grant
exists, show denied without loading request data.

Notification deep links select the scope that addresses their recipient
(DEC-DOCUMENT-REQUESTS-004). `document.requested` and
`document.replacement-requested` reach the worker and select Own scope, resolving
the object through the self endpoint. `document.submitted` reaches the HR
requester and selects HR scope, resolving the object through the HR endpoint.
Every destination still performs its existing permission and subject checks; a
recipient without the selected scope's read grant sees denied. Neither grants nor
recipient rules are broadened to make a link work.
