# Document Templates — technical design

Status: business design admitted; UX reconciled with the authorized HCM-1 decision matrix.

## ROUTE

Selected route `/documents/document-templates`; lazy feature `libs/hcm/web/documents/feature-document-templates`. Selection is recorded
in this blueprint for review; canonical route/floorplan remain null until the TDD
revision is approved. Keep implementationStatus Planned. Existing catalogue
placements remain UX metadata and never determine code ownership.

## READ

Manage versioned HR-only reference files for a document type. Use the domain DTO projection, not SELECT * or entity serialization.
q matches template label; typeId filter; label asc/desc then id; versions versionNumber desc then id.

HR lists templates and immutable versions; employee self-service has no template access.

## API

All DTOs/validation belong to `hcm-documents-contract`. The app-specific endpoint
table below and [domain DTOs](../../domain/HCM-1-DOCUMENTS.md#contract)
are normative together with [transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api).
Optional values use `?`; all other body fields are required. Multipart uploads use
one JSON metadata part and one file. Query capabilities are only those listed.
No body/query contains tenantId or a self-service actor override.

| Operation                                                            | Permission                         | Request                                               | Response                                    |
| -------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `GET /api/v1/documents/templates`                                    | `hcm.documents.templates.read`     | `List query: typeId?`                                 | `Page<TemplateDto>`                         |
| `GET /api/v1/documents/templates/{id}/versions`                      | `hcm.documents.templates.read`     | `List query`                                          | `Page<VersionDto>`                          |
| `GET /api/v1/documents/template-type-options`                        | `hcm.documents.templates.manage`   | `List query: enabled=true`                            | `Page<{id,code,label}>`                     |
| `POST /api/v1/documents/templates`                                   | `hcm.documents.templates.manage`   | `multipart: metadata {typeId,label,reason}, file`     | `{template:TemplateDto,version:VersionDto}` |
| `POST /api/v1/documents/templates/{id}/versions`                     | `hcm.documents.templates.manage`   | `multipart: metadata {expectedRevision,reason}, file` | `{template:TemplateDto,version:VersionDto}` |
| `GET /api/v1/documents/templates/{id}/versions/{versionId}/download` | `hcm.documents.templates.download` | `None`                                                | `Attachment bytes`                          |

Creation is 201; commands/reads 200. Common 400/401/403/404/409/413/415/423/503
classification applies where relevant. PUT is revisioned command semantics, not an
unbounded persistence-row replacement. Mutations use an idempotency key; existing
state transitions and unsupported methods cannot bypass the domain policy.

## ACTION

Create or version with validated PDF/PNG/JPEG <=10 MiB through the staged upload protocol.

Forms use the shared Signal Forms protocol, Native Dialog: type picker for create, label and FileUploader; version upload shows current revision and reason. Type/label remain unchanged on version append.

Crash/retry yields one Ready version only; reject disabled type for new template.

## RULES

Stream an authorized immutable attachment with access audit, not mail merge/e-signature/public URL.

Verify headers, persistent bytes/hash, denied foreign version and missing-file 503.

Authoritative detailed invariants are in [domain policy](../../domain/HCM-1-DOCUMENTS.md#policy).
Actions not enumerated in the endpoint table are not implicitly permitted.

## AUTH

Entitlement: `hcm.documents`. Discovery remains
`hcm.catalogue.DOCUMENT_TEMPLATES.discover` and is not any permission below.
Actors and subject scope: HR Operations with explicit template permissions.

| Business permission                | Authorized function                   |
| ---------------------------------- | ------------------------------------- |
| `hcm.documents.templates.read`     | List reference templates              |
| `hcm.documents.templates.manage`   | Create template/upload next version   |
| `hcm.documents.templates.download` | Download authorized reference version |

Use [verified request authorization](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth).
Resolve self from the account linkage. A caller with tenant-wide grants uses only
explicit tenant endpoints; self endpoints never expand to all records. Check
authorization again inside the transaction/download, even after UI capability checks.
Cross-tenant or inaccessible self objects return 404 without revealing existence;
missing operation permission returns 403 before querying object details.

## DATA

Data/read-model ownership:

- `document_template` — owned by documents; this app uses the owning domain contract.
- `document_template_version` — owned by documents; this app uses the owning domain contract.
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

Floorplan `UX-FP-FCL`, mode **NATIVE**. Keep the server-filtered template list in a begin-column HcmDynamicPage. Selected template opens a mid-column approved Object Page with Overview and Versions sections. Selection is deep-linkable by template ID; each column has its native page header. The Object Page retains native anchor navigation and version download actions. Small create/version forms use maintained dialogs, never the template detail workspace.
The [installed capability evidence](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#native)
and [interaction/state specification](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux)
are part of this selection. Consume the approved shared Object Page composition inside native FlexibleColumnLayout; no custom floorplan or feature CSS.

Content columns/fields: Template label/type; revision; version number; filename; size; created date.

Table declaration: mode **server**. q matches template label; typeId filter; label asc/desc then id; versions versionNumber desc then id.
Cursor pages default 25/max 100; native growing button loads the next cursor; sort and filter run on the server.
Single row/detail action selection only; no bulk actions, column personalization,
virtualization or export. Native Popin retains secondary data with meaningful
labels on narrow screens. Summary-only content does not invent a table.

Forms use the shared Signal Forms protocol, Native Dialog: type picker for create, label and FileUploader; version upload shows current revision and reason. Type/label remain unchanged on version append.

Field rules come from the domain/API contract. Save validates synchronously then
submits once; server conflicts keep the draft, 503 offers a safe same-key retry.
No autosave/persisted draft. Initial loading, no-results, error, denied/unavailable,
read-only and pending-action states follow the shared contract. Dirty leave/context
switch requires confirmation, then cancels requests and clears prior-context data.
Focus returns to the triggering action after dialogs. No feature CSS or theme imports.

## PROJECTS

Planned project declarations; do not generate until the stage is admitted. Sibling
apps reuse domain contract/data-access/API projects. Four tags are authoritative.

| Project                                        | Root                                                | Tags                                                                    |
| ---------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `hcm-web-documents-feature-document-templates` | `libs/hcm/web/documents/feature-document-templates` | `product:hcm`, `runtime:web`, `domain:documents`, `type:feature`        |
| `hcm-web-documents-data-access`                | `libs/hcm/web/documents/data-access`                | `product:hcm`, `runtime:web`, `domain:documents`, `type:data-access`    |
| `hcm-documents-contract`                       | `libs/hcm/contracts/documents`                      | `product:hcm`, `runtime:universal`, `domain:documents`, `type:contract` |
| `hcm-api-documents-domain`                     | `libs/hcm/api/documents/domain`                     | `product:hcm`, `runtime:api`, `domain:documents`, `type:domain`         |
| `hcm-api-documents-application`                | `libs/hcm/api/documents/application`                | `product:hcm`, `runtime:api`, `domain:documents`, `type:application`    |
| `hcm-api-documents-infrastructure`             | `libs/hcm/api/documents/infrastructure`             | `product:hcm`, `runtime:api`, `domain:documents`, `type:infrastructure` |
| `hcm-api-documents-transport`                  | `libs/hcm/api/documents/transport`                  | `product:hcm`, `runtime:api`, `domain:documents`, `type:transport`      |
| `hcm-api-documents-module`                     | `libs/hcm/api/documents/module`                     | `product:hcm`, `runtime:api`, `domain:documents`, `type:module`         |

Application/domain ports contain no Kysely, HTTP or Nest types. Infrastructure owns
SQL and DTO mapping; transport owns validation; module composes dependencies.
Angular feature -> own data-access/contracts + existing UX floorplan; no imports
from another feature or server implementation. Existing database/runtime/audit
dependencies retain their own project ownership and public contracts. Thin app
roots add only module composition and lazy-route registration.

## DEPENDENCIES

File adapter/reconciliation design, audit read events and type policy.

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

Branch `codex/hcm-1-document-templates` after all 20 local designs have reviewed evidence.
Commit contracts/design reconciliation, then domain SQL/API, then native UI, then
acceptance evidence as coherent slices. No application code is authorized by this
design-only request. Keep six deferred apps and full-wave completion blocked.

## DISCOVERY

The canonical app currently belongs only to tenant-administration. Add
`hr-specialist-operations` membership and placement `{spaceId: hr-operations,
pageId: hr-governance-assets-engagement, sectionId: hr-documents-governance,
display: tiles}` at reviewed metadata publication so Toby's approved HR authority
can use the app without catalogue inspection. These existing IDs were inspected
in hcm-launchpad.json. Preserve the Administration placement and one feature.
Seed HR discovery separately from template read/manage/download permissions;
David's existing discovery grant does not authorize reference-file content.
Entry checks templates.read before requesting protected data.

## UX REVISION

The [authorized matrix](../../roadmap/HCM-1-UX-REVISION.md) supersedes the earlier Dynamic-Page-only selection. Meaningful version details require FCL/Object Page. A create dialog has only type, label, file and reason; appending one version has file and reason with a read-only target/revision. These are focused actions, not complex multi-section creates. A paginated server type picker stays bounded and uses maintained controls. Native list/detail selection, close/back, focus restoration, four themes and narrow-screen navigation require browser acceptance. Business contracts and storage recovery remain unchanged.
