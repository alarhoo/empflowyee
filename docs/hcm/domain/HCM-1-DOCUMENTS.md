# HCM-1 documents design

Status: complete design for review under the approved bounded behavior.
Incorporates [shared technical contracts](../tdd/TDD-HCM-1-LOCAL-COMMON.md).

<a id="policy"></a>

## POLICY — Classification, sharing and request lifecycle

Toby's HR role manages document types/templates and worker-linked documents. David
has no automatic content access; an explicitly granted HR role is required. Own
document access derives the verified account's person/worker. Michael receives no
team scope. HR may upload for workers without accounts; this creates no login.

Types have immutable code (uppercase letters/digits/underscore, 1–50), editable
label (1–100), optional description (maximum 500) and enabled flag. Disabling
prevents new standalone documents/templates/requests for that type, but preserves
existing access and fulfillment of already open requests. No type deletion or
implied retention/required-document rules. Templates are HR-only versioned reference
files for a type, with label (1–100), no generation/mail merge or employee sharing.

Employee documents have worker, type and label (1–150). HR uploads immutable
versions and explicitly controls employeeVisible per version (default false).
Self reads list only Ready, visible versions; hidden versions and their counts,
filenames and metadata are excluded. Replacing a document does not hide an older
version automatically; sharing changes target one version and require a reason.
An employee-submitted request version is visible to that employee as their own
submission; it does not grant access to any separate HR-only version.

Request states: Open -> Submitted by addressed employee upload; Submitted ->
Completed by HR accept; Submitted -> Open by HR replacement request with reason;
Open/Submitted -> Cancelled by HR with reason. No reopen of Completed/Cancelled.
Accept must select the latest submission associated with the current Submitted
revision; an older-cycle submission ID cannot silently replace the current one.
Subsequent submission creates a new immutable version; all previous submissions
remain attributable and visible to the addressed employee and authorized HR.
Due date optional and informational; no time-triggered status changes. Acceptance
does not certify legal validity. No employee-side arbitrary upload to other workers.

<a id="data"></a>

## DATA — Metadata and aggregate constraints

Add document_type `(tenant_id,id)`, code unique within tenant, label, description,
enabled, revision and common timestamps/actors. Add document_template `(tenant_id,id)`,
type_id, label, revision and common metadata; add document_template_version
`(tenant_id,id)`, template_id, version_number positive, blob_id, created_by/account/time.
Unique `(tenant_id,template_id,version_number)`. Types/templates have no normal DELETE.

Add employee_document `(tenant_id,id)`, worker_id, type_id, label, revision,
created_by/time. Add employee_document_version `(tenant_id,id)`, document_id,
version_number, blob_id, employee_visible boolean, revision, created_by/time;
unique `(tenant_id,document_id,version_number)`. Sharing state can change under
revision, bytes cannot. Cross-tenant references include tenant_id. Worker/person
projection is read-only; do not mutate workforce or add employment lifecycle.

Add document_request `(tenant_id,id)`, worker_id, type_id, requested_by_account_id,
instructions (0–1000 plain text), due_date nullable, status, revision, created_at,
updated_at, accepted_version_id nullable. Add document_request_submission
`(tenant_id,id)`, request_id, version_number, blob_id, submitted_by_account_id,
created_at; unique request/version. Accepted version must belong to that request
through a composite FK `(tenant_id,id,accepted_version_id)` against a unique
submission `(tenant_id,request_id,id)` key; add after both tables exist. Audit
records carry transitions/reasons, not instructions/file contents. Submitted must
have a current submission; Completed must name an accepted version, enforced by
the transactional command and database deferred consistency constraint.

Add document_blob `(tenant_id,id)`, storage_key unique, sha256, byte_length between
1 and 10485760, media_type restricted to PDF/PNG/JPEG, safe_filename, state
Staged/Ready/Failed, created_by_account_id, created_at. Blob references are internal:
neither storage_key nor filesystem path appears in DTOs. Add document_command_receipt.
RLS covers all records; indexes tenant/worker_id/id for documents/requests and
tenant/request_id/version_number for submissions. Runtime no metadata/file DELETE
through business endpoints; staged orphan cleanup is controlled infrastructure.

<a id="storage"></a>

## STORAGE — Local persistence without pretending filesystem atomicity

Use one private persistent local root configured by the existing local launcher,
outside static assets/source-controlled content, with staging and immutable blob
subdirectories on the same filesystem. Keys are server UUIDs; resolve canonical
absolute paths and reject paths outside that root, symlinks/junctions and remote
storage URLs. Never derive paths from original filenames or tenant-supplied strings.
Single-process local adapter only; production object storage/scanning is deferred.

Upload protocol (same for template/document/request aggregate commands):

1. Verify actor, permission, entitlement and target subject before accepting bytes.
   Stream one multipart file into a newly created private staging file, enforcing
   10 MiB exact byte maximum plus bounded metadata; validate file signature and
   extension/MIME agreement for PDF/PNG/JPEG. Hash bytes and fsync; reject zero bytes.
2. In a verified tenant transaction, check idempotency, current authorization,
   aggregate revision/state and reserve a Staged blob/receipt intent. Do not expose
   a business version, state transition, success audit or notification yet. Persist
   enough safe intent metadata to reconcile, scoped to actor/operation/target/key.
3. Atomically rename into the immutable blob root. In a second verified transaction,
   recheck authority/revision/state, verify file exists/hash matches, then set Ready
   and create the version/transition, audit, notification and successful receipt.
   Return 201/200 only after that commit. If revision/authority changed, mark the
   reserved attempt Failed and leave the business aggregate unchanged.
4. Retries with the same idempotency key inspect the reserved attempt: resume a
   verified staged/final file, return its completed result or report a failed attempt.
   Never duplicate a version/event or report uncommitted data as successful.

Represent upload reservations separately in document_upload_attempt:
`(tenant_id,id), actor_account_id, operation, idempotency_key, payload_hash,
blob_id, aggregate_id, expected_revision, safe_intent jsonb, state, created_at`;
unique actor/operation/key within tenant. Validate intent schema and do not place
file contents in JSON. Upload cleanup records failure but never finalizes a business
command under an invented worker identity. The authenticated retry completes it.

On local adapter startup perform read-only inventory/availability checking; do not
run database migrations or silently repair business state. An explicit local
maintenance command reports and marks abandoned attempts under the existing
operator workflow, and removes only unreferenced staging/orphan files after a
24-hour grace and rechecking metadata. Never delete a referenced Ready file or
automatically purge business documents. A crash before/after every numbered step
must be covered by recovery tests. Missing Ready bytes cause safe 503, not a fake
download or deletion. Back up DB and blob volume together for local recovery.

Download: resolve version under tenant/subject scope, open only its Ready immutable
file, append `download-authorized` audit before releasing bytes, then stream with
attachment Content-Disposition, verified Content-Type, Content-Length and nosniff.
Sanitize filename/control characters for headers. Record completed/failed when
observable in a separate short authenticated transaction; crash means unknown
completion. Do not inline-render or expose static/signed public URLs. Authorization
is point-in-time at download start; disable/revoke applies to subsequent requests.

<a id="contract"></a>

## CONTRACT — DTOs and internal events

TypeDto `{id,code,label,description,enabled,revision}`. TemplateDto
`{id,typeId,label,revision}` and VersionDto `{id,versionNumber,filename,mediaType,
byteLength,createdAt,revision?,employeeVisible?}`; only applicable fields appear.
WorkerDocumentDto `{id,workerId,typeId,label,revision}`. SelfDocumentDto
`{id,typeId,label}` excludes worker selection and HR-only versions; its separate
version endpoint returns only authorized VersionDto rows, with no hidden-version
count or latest-version number derived from invisible rows.
RequestDto `{id,typeId,workerId,status,dueDate,instructions,revision,createdAt,
requestedByAccountId,acceptedVersionId}`. SelfRequestDto
`{id,typeId,status,dueDate,instructions,revision,createdAt,requesterDisplayName,acceptedVersionId}`
omits worker selection and requester account ID. Nullable dueDate/acceptedVersionId
are explicit null, not omitted; instructions defaults to empty text. Submissions
are a paginated child collection. A submission VersionDto uses its own row id,
versionNumber, verified filename/mediaType/byteLength and createdAt; it has neither
employeeVisible nor an independently mutable revision.

Event input for notifications: immutable event occurrence UUID, eventType,
requestId, dueDate, worker person ID and requester account ID derived from the
transaction's records. Emit only requested, submitted and replacement-requested.
No completion/cancellation notification is silently added to the approved set.

<a id="dependencies"></a>

## DEPENDENCIES — Shared policies without a workflow engine

Documents owns request transitions, storage metadata and file adapter. Reuse audit
append and notifications event-intent ports inside the final business transaction;
workforce supplies a tenant-scoped read-only worker/person picker port. Do not
create workflow/governance applications, timers, legal policy engines or external
integrations. Employee request discoverability is added only with reviewed app
metadata; business subject checks apply regardless of where a tile is placed.

The documents application declares a consumer read port with `listWorkers(query)`
returning `Page<{id,displayName,workerCode}>`, `requireWorker(id)` returning
`{workerId,personId}` or not-found, and `resolveOwnWorker()` returning that pair or
null from the verified account's linkage. Its infrastructure adapter reads only
approved HCM-0 workforce/person columns in the caller's tenant transaction. It
does not import another domain implementation, write workforce records or require
the future Employee Directory/HCM-2 business application. These adapters fit the
already declared documents application/infrastructure projects.

<a id="test"></a>

## TEST — Domain proof obligations

Cross-tenant/other-worker read, hidden version metadata, forged worker IDs, wrong
request state, stale sharing revisions and administrator-without-HR access fail.
Test magic bytes, 10 MiB boundary, MIME mismatch, filenames, paths/junctions and
partial disk/DB writes. Request races (two submissions; submit versus cancel;
accept versus replace) produce one transition under revision. Disabled type keeps
existing requests fulfillable. Retry produces one version, audit and notification.
