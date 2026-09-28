# HCM-3 shared technical design

Status: approved technical design, 2026-09-28, under the bounded
[product-owner delegation](../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation is
planned. The [accepted worker ADR](../adr/ADR-HCM-BACKGROUND-WORK.md) authorizes
the runtime exception; no other deployable or authentication service is added.

## CONTRACTS

Runtime-universal domain DTOs, not persistence rows, are the public contract.
HTTP is `/api/v1/{leave|attendance|workflow}`; app TDDs enumerate admitted routes.
No dynamic source URL, script, tenantId, actorId or role is accepted from browser
command bodies. Transport rejects unknown properties and maps domain safe errors
through the current HCM error envelope. Required strings reject whitespace-only
values without silently trimming or rewriting stored evidence.

Shared scalar schema: Id is the existing nonempty opaque text identifier, maximum
200 characters. New IDs are UUID text; existing IDs are not recast. Revision is a
positive safe integer. Dates are real ISO local dates, times ISO local wall times,
instants ISO UTC with millisecond precision, zone is a validated IANA identifier.
Duration is an integer decimal-string `elapsedMilliseconds`; qualifying time uses
the same precision and `qualifyingMinutes` is a rational `{numerator,denominator}`
with denominator 60000 and numerator milliseconds. No implicit minute rounding.
Leave Units is a signed decimal string, up to 12 integer and 6 fractional digits;
positive/nonzero constraints depend on operation. Calculators retain rational
inputs and apply only the published leave rule's rounding before posting.

Each mutation has an `Idempotency-Key` UUID, and existing resources require
`expectedRevision`. A preview-dependent command also has `previewId,digest`.
The server builds a canonical digest including actor, operation, route subject
and all business input. Same key/input returns the durable receipt after current
read authorization; changed input is 409. A response lost after commit is queried
or replayed with the same key. Async 202 means accepted intent, not business
completion. Results contain `{id,revision,state,operationId?}`; read views contain
only the app's projection and permitted actions. Creates return 201, synchronous
commands 200. Errors: 400 field validation, 401 invalid session, 403 operation
denied, 404 hidden/missing subject, 409 stale/locked/disabled/conflict/insufficient
balance, 413 size, 415 type, 503 dependency unavailable. Errors never echo secrets.

Collections accept `cursor,limit` (25 default, 1–100), exact ID/status/date filters
and app-declared sort keys plus ID tie-break. Opaque authenticated cursors bind
tenant, actor, permission/scope digest, filters, sort and last key. Reject changed
context; filter before pagination and counts. Date ranges are inclusive, at most
366 dates per request (query safety bound, not a business entitlement); clients
partition longer authorized views. Source revisions and fresh authorization are
checked per page. No local sorting of partial server results.

## AUTHORIZATION

Access Control retains sole ownership of grants and their scope evaluation.
Add an optional `account_role_scope` child keyed by tenant/grant/scope target,
with target kind Tenant/LegalEntity/OrgUnit/Department/Location/Assignment/Employment;
unscoped existing grants keep their existing semantics. One operation must be
satisfied by one grant's complete predicate, never by mixing different grants.
Existing role assignment UI remains the owner; HCM-3 apps cannot create grants.
The source reuses `HcmAccessDatabase` current account, entitlement and operation
checks inside the tenant transaction and existing revocation lock ordering.
Read scope comes from workforce projections at the relevant date, not browser
filters. Team scope is current permitted reports; employee self scope is a
verified own employment. Manager relationship alone creates no permission.

Human commands use the existing authenticated session with permission, scope,
reason and audit. No new step-up infrastructure. Source approvals reject maker,
beneficiary and prior distinct-slot actors where the manifest requires it. The
source resolves current candidates; no Workflow candidate row grants authority.
There is no delegation or out-of-office creation contract in this release.
Worker authority never substitutes for a human approval. Reassignment intersects
current source candidates and is allowed only before ActionPending dispatch.

## WORKLOAD

The new thin `hcm-worker` root calls Runtime's internal workload issuer after
validated startup configuration and `assertHcmRuntimeRole`. Issuer is an injected
in-process capability available only to the worker root, not an HTTP provider.
It returns an opaque WeakMap-registered context `{tenant,workload,runId,expiresAt}`;
caller objects/deserialized queue JSON cannot construct it. Allowlist workloads:
LeaveAccrual, LeaveExpiry, AttendanceResolve, AttendanceCalculate,
AttendanceReconcile, WorkflowPlan, WorkflowDispatch, WorkflowReconcile,
NotificationDispatch. Existing tenant directory supplies active IDs; no tenant
identifier from a work payload can override the current tenant transaction.
Transaction entry validates registration, expiry, active tenant and workload;
sets transaction-local tenant context; uses the existing non-owner non-BYPASSRLS
role. Handlers validate work kind against workload before loading the row.
No RLS bypass, fake UserAccount or reusable browser token is introduced.

Domain outbox rows contain schemaVersion, kind, immutable payload/digest and
business key. Claims use SKIP LOCKED, lease owner, monotonically increasing fence,
lease expiry and attempts; completion compares fence and input revision in the
same transaction as business result, receipt, audit and next outbox. Planner
cursors advance only with durable items. Tenant and batch/time budgets bound each
run; poison items enter a named exception and cannot starve other tenants. Local
finite drain exits when its budget or due work ends. Optional poll has graceful
shutdown. Retry/backoff settings are validated runtime configuration; retries
never change business keys. No migrations during API or worker startup.

Source action intents stay in the same HCM trust boundary: source-owned application
ports called by fixed adapters, not arbitrary HTTP destinations. Workflow stores
server-established actor account, authenticated-context expiry, source permission/
scope reference and canonical intent digest. Runtime issues an internal durable
action-authorization reference from the verified context when accepting the intent;
it is not a new login or step-up credential. Existing context exposes tenant/account/
expiry, so no nonexistent public session-ID field or browser token is assumed. Source verifies trusted adapter provenance,
checks current session validity and authorization before a new decision, then
commits its own receipt. An expired actor may query an existing result through a
currently authorized session; expiry before acceptance denies the attempted new
decision and requires a new online review. Unknown delivery must be queried by
the original key before retry. A worker cannot renew a human session.

## FOUNDATIONS

Workforce adds a minimal `WorkforceTimeContext` read port: employment/worker IDs,
dated assignments and revisions, legal entity, org unit, department, location,
timezone, employment/service dates, worker type and digest. Missing facts return
Unavailable. Bind ports in composition; no reciprocal infrastructure imports.

Workforce also owns an internal `WorkforceTimeSubjects` paging port for impact
and producer planning. It selects employment IDs/revisions for one real workDate
and exactly one Tenant/LegalEntity/OrgUnit/Department/Location/Assignment/Employment
target. Employment date coverage is inclusive; current employment status alone
never drops valid historical subjects. Unknown hire dates remain candidates so
the time-context port can report incomplete facts. Tenant/Employment/LegalEntity
selection does not require a matching assignment; assignment-derived targets use
an effective assignment EXISTS predicate and never duplicate a subject with
multiple matches. No names, personal data or cross-employment combination is returned.

This internal port uses an employment-ID keyset in PostgreSQL C collation, 1?100
items and one extra lookahead row, with a nullable nextAfterEmploymentId. It is
not a browser cursor or an authority token. The caller owns current scope/workload
authorization and the existing tenant transaction/lock for stable enumeration;
publication re-enumerates membership and dated context digests under that boundary.
Missing tenant context returns no rows; pool binding and malformed dates, selectors,
limits or continuation IDs are rejected. HTTP APIs must retain their own opaque,
authority-bound cursor rules rather than expose this internal continuation.

Documents extends its existing blob consumer-purpose enum with LeaveEvidence and
AttendanceEvidence. Stage/attach/open calls bind tenant, subject, uploader and
classification; PDF/PNG/JPEG up to 10 MiB use existing storage validation. Staged
evidence is never attachable until the existing validation pipeline reports
clean; pending/blocked remain explicit. General/Confidential/Restricted are
purpose classifications; no client downgrade. Rebinding to another subject is
forbidden. Content permission is separate from request list permission. No new
antivirus certification or external provider is claimed. Cipher narrative fields
use FieldCipher tenant/table/column/row binding and existing key version handling.

Notifications adds typed domain event and recipient contracts using the current
inbox/preferences/templates/intent mechanism. Outbox uniqueness binds source
event, recipient and template revision. Only safe references/status summaries
enter notifications; no private reason/evidence. External delivery remains out
of scope. Failure retries notification independently of the committed decision.

Audit adds `actor_kind Human|Workload` and `workload_code/run_id`; actor_account_id
is required exactly for Human and null exactly for Workload. Existing rows default
Human. Existing public human AuditItem DTO and endpoint retain their shape and
filter Human; a new workload-audit projection returns the discriminated actor
only to permitted operations readers. Preserve all actor FKs/tenant keys. No
fabricated human identity or silent breaking change to the current audit API.

## FORMS

Signal Forms owns values, touched/submitted state and cross-field errors; shared
validators are mirrored server-side. Code 1–40 `[A-Z][A-Z0-9_-]*`, name 1–120,
description optional up to 2000, reason required for decisions/withdraw/recovery/
on-behalf work and up to 2000. IDs and bounded enum values use authorized pickers.
Display validation next to the control and in a focusable error summary. Reject
unknown enums, numeric overflow, malformed dates and too much precision; do not
sanitize a user's business input silently. Published controls read-only.
No arbitrary regex/expression editor. Explicit configuration fields are required
before activation; absent legal limits never receive invented defaults.

## UX

Installed evidence inspected 2026-09-28: Fundamental Core/Platform/UI5 wrappers
0.64.3, UI5 2.26.0. Fiori `FlexibleColumnLayout` is exported by
`@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout`; Calendar by
`@fundamental-ngx/ui5-webcomponents/calendar` exposes selection change and
date/special-date/legend slots. Platform table and Core calendar date views were
also evaluated. There is no evidenced native resource-scheduling grid; use a
native Calendar with agenda/table and an ordinary roster entry editor.

All apps use maintained HcmDynamicPage and HcmObjectPage compositions; each FCL
column has its own native-backed page and title. Global centered 90rem canvas
remains at shell boundary. Lists use maintained table, HcmViewSettings and
whole-row keyboard navigation, page toolbar filters and selection actions.
ObjectPage detail sections use native Form/FormItem with DatePicker, TimePicker,
DateTimePicker, Select/ComboBox, TextArea and FileUploader as appropriate.
`ObjectStatusComponent` from `@fundamental-ngx/core/object-status` 0.64.3 with
inverted styling indicates semantic status. This is the inspected existing
My Profile import, not a nonexistent UI5 ObjectStatus export. Details have Close and native
Maximize/Minimize title navigation. At narrow width one active FCL column shows;
back/close restores list selection/focus. Headers/footers retain meaningful action
labels. Calendar selection updates a textual agenda accessible without color.

No custom CSS, theme branches, resource grid, business fixture arrays, Storybook
or Theme Lab. Signals/data-access own cancellation of stale requests and clear
private state on context changes. Distinguish loading, empty, unconfigured,
permission denied, stale data and recoverable failure. Dirty form navigation asks
before discarding. Native keyboard and screen-reader behavior must be tested in
the production app; design approval is not runtime UX acceptance.

## VERIFICATION

Foundation integration tests must use real PostgreSQL transactions with RLS:
foreign tenant payload/FK, unregistered/expired workload context, tenant suspension,
scope revocation race, two employments, cipher leakage and audit actor constraints.
Crash before/after commit, same-key replay, changed-input replay, two workers,
lease expiry and stale completion, missed-date catchup, lost acknowledgement and
poison-item fairness are required. Source auth expiry before dispatch and receipt
query after accepted decision are separate cases. Existing audit consumer DTO
contract must remain unchanged. App traceability lists acceptance test plans,
not claimed executed tests. Delivery must produce the actual test evidence.
