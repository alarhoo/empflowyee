# HCM-1 local stage technical contract

Status: design complete for review; no application implementation or document-revision
approval claimed. The approved business scope is recorded in
[HCM-1 decisions](../roadmap/HCM-1-DECISIONS.md). Each app TDD incorporates the
sections below and its owning domain contract. Changes to these shared contracts
invalidate approval hashes in every consuming blueprint.

<a id="api"></a>

## API — Transport and validation

Use `/api/v1/<domain>/...` and additive runtime-universal DTOs in
`libs/hcm/contracts/<domain>`. DTO field names are camelCase; persistence uses
snake_case and is never serialized directly. IDs are opaque strings, maximum 200
characters, URL-encoded as single path parameters; do not derive tenant or authority
from their contents. New IDs are server-generated UUIDs stored as text to match the
foundation. Existing seed IDs remain valid. Timestamps are UTC ISO-8601 strings;
date-only due dates are `YYYY-MM-DD` and are informational, without time-based escalation.

All lists use `Page<T> = {items: T[], nextCursor: string|null}` unless the app
explicitly defines a bounded client-mode collection. Server-mode query:
`{limit?: integer, cursor?: string, q?: string, sort?: string, ...listedFilters}`.
Default limit 25, maximum 100; q maximum 200 characters. Reject invalid, unknown or
duplicate parameters with 400. Search is parameterized case-insensitive literal
substring matching on the app's named fields, never raw SQL/LIKE syntax supplied by
the caller. Escape wildcard characters. No unbounded count or export by default.

Cursors encode version, sort, filter fingerprint and the last sort tuple; validate
length (2 KiB maximum), shape and sort types before using them. Reapply server
tenant/subject predicates independently; a cursor is never authority. Append id as
a stable tie-breaker. Cursor pagination is a live view, not a historical snapshot;
reset it after mutation or filter changes. No totals imply snapshot consistency.

All JSON mutations reject unknown properties, require an `Idempotency-Key` UUID and
return the response of the first successful identical request by that actor/route/key.
The receipt key includes tenant, actor account, operation and key; store a canonical
request hash and safe response in the owning domain's receipt table. Reuse with a
different payload returns 409. Failed transactions leave no successful receipt.
Concurrent identical keys serialize via the unique receipt constraint; the losing
transaction reloads the committed receipt. Re-authorize before replaying responses.
Receipts have no local automatic purge. File uploads hash accepted bytes and metadata.

Versioned writes require `expectedRevision` (positive integer). Return 409
`revision-conflict` without replacing a newer state. Create returns 201 and its DTO;
other commands return 200 and their DTO, including deletion acknowledgements.
Read operations return 200. No 200 response on a failed write. Safe error shape:
`{code, requestId, fieldErrors?: [{field, code}]}`. Do not reflect arbitrary messages,
SQL, secrets or unvalidated submitted values. Clients localize stable error codes.

| Status    | Meaning                                                                                      |
| --------- | -------------------------------------------------------------------------------------------- |
| 400       | Invalid request, query, transition input or unsupported property                             |
| 401       | No valid verified context, expired context or disabled account                               |
| 403       | Missing business permission/entitlement or failed write-origin validation                    |
| 404       | Missing object, another tenant's object or an inaccessible self-service object               |
| 409       | Revision conflict, invalid current transition, duplicate business key or protected invariant |
| 413 / 415 | File too large / unsupported or mismatched file content                                      |
| 423       | Inaccessible tenant lifecycle state, using the runtime classification                        |
| 503       | Database/storage unavailable; safe retry with the same idempotency key                       |

Set `Cache-Control: no-store` and `X-Request-ID` on protected responses. Query
validation and response serialization live in transport; application/domain use
typed commands and classified errors, not Nest/HTTP exceptions.

<a id="auth"></a>

## AUTH — Verified authority and local requests

Reuse `HcmRequestTenantContext.authenticated()` and `AuthenticatedHcmContext`;
reject client tenant IDs, account impersonation and copied public session DTOs.
Reuse `HcmTenantDatabase.transaction()` and its runtime-role and context checks.
Under that transaction, reload account enabled state, role grants and entitlements
before command authorization. Browser route/discovery checks remain presentation
only. The server checks action permission AND entitlement AND subject scope.
No wildcard administrator bypass, implicit parent-domain grant or persona-name check.

Self-service account identity comes from the verified context; person/worker keys
come from the account linkage. Never trust employeeId/personId supplied by the
browser to select an own-record subject. Permissions for one person's own data do
not authorize another account linked to that person: notifications/activity remain
account-owned; documents are person/worker-owned.

The existing local adapter remains opt-in, loopback-only and prohibited outside
local development. Production requests still fail closed. Extend its use to these
reviewed commands without creating cookies, tokens, session inventory or a second
trust boundary. Amend the local-session ADR's read-only scope before implementation;
this design does not enable any endpoint now.

One runtime-context-owned HTTP interceptor supplies the server-advertised persona
header only to the configured same-origin HCM `/api/v1/` base. It must reject or
omit propagation for foreign origins and redirects; never attach it globally.
Business features do not construct persona headers. Requests are cancelled and all
domain caches/edit drafts cleared on persona/tenant switch; cache keys include both.
Late responses from the previous context are discarded. Route refresh obtains new
permissions; server authorization remains definitive during any UI refresh delay.

Local mutating requests must carry the exact configured HCM development Origin
(scheme, hostname and port), JSON content type or the specified multipart type,
and a same-origin fetch metadata value when that header is present. Reject absent
or mismatched Origin for these browser commands; integration tests supply it.
Resolve tenant from the preserved Host, not Origin. CORS never allows wildcard or
arbitrary reflected origins with persona headers. This protects against browser
cross-origin writes but does not claim protection from an authorized local process
that can already select development personas. Production CSRF/authentication is
separate deferred design work.

<a id="tx"></a>

## TX — Transactions and cross-domain ports

Application code owns use cases and abstract unit-of-work ports; infrastructure
owns the Kysely transaction. A use-case unit of work exposes domain repositories,
authorization, audit append and notification intent ports bound to the **same**
transaction; it never exposes Kysely/pg types to the application/domain layer.
Module composition injects implementations. Public API-domain/application contracts
may be dependencies under Nx rules; no feature-to-feature or product imports.

Serialize tenant administrative mutations with a transaction-scoped PostgreSQL
advisory lock derived from the verified tenant ID (`pg_advisory_xact_lock` with
`hashtextextended(tenantId, 0)`), then lock target account/role/aggregate rows in
stable ID order. Hash collisions only cause conservative serialization; the lock
never grants tenant authority. Do not use SELECT FOR UPDATE on the Account-owned
tenant projection: that would require an inappropriate UPDATE grant on that table.
Role changes, grants,
account disable and review revocation share that lock order. Recheck current
authority and last-administrator conditions inside the lock, not before it.
Ordinary reads use a short verified transaction; sensitive download authorization
defines its point-in-time start, not continuous stream revocation.

A successful mutation commits aggregate changes, incremented revision, audit event,
notification intent when applicable and its idempotency receipt together. Inject
failures at every stage to prove rollback. A technical error is never converted
into empty business data. Audit transport/read failures have no mutation side effects.

<a id="sql"></a>

## SQL — PostgreSQL and Kysely

All tenant tables have direct `tenant_id`, composite `(tenant_id,id)` primary keys
(or the explicitly specified composite natural key), same-tenant foreign keys,
and ENABLE/FORCE RLS with both USING and WITH CHECK comparing to
`hcm.current_tenant_id()`. No context means no tenant rows. RLS does not replace
the subject/permission predicates above. Runtime is non-owner `hcm_runtime`, never
BYPASSRLS; grant only declared operations. No SECURITY DEFINER bypass or public
database grants. Global canonical app/event definitions are immutable product
metadata and explicitly separated from tenant grants/configuration.

Mutable aggregates use revision integer greater than zero, created_at/updated_at
timestamptz and creator/updater account references where specified. SQL CHECK and
unique constraints enforce enumerations, nonempty trimmed labels, bounded fields,
positive revisions, tenant-consistent references and one logical current state.
Index tenant first, followed by list filter/sort keys and id; owner lists additionally
index their account/person key. Never omit tenant filters because RLS exists.

Applied migrations 000001–000005 and seed modules stay immutable. Add sequential
forward migrations through the existing explicit runner, ordered access/audit
foundation before dependent features. Domain documents specify ownership; database
tooling orchestrates, not owns business rules. Kysely interfaces mirror applied SQL,
with explicit DTO mappers. SQL is the schema authority; no ORM-generated schema.

Migration acceptance: upgrade a copy of populated HCM-0, preserve all original keys
and grants, apply twice without drift, test constraints/RLS as runtime, and test
denied cross-tenant INSERT/UPDATE/DELETE and association joins. Add versioned seed
modules for new permissions/grants and fictional domain records; never replace
existing HCM-0 seed checksums or inject fixtures into application components.

Rollback is operational: stop exposing the new route/command, revert application
artifact to a schema-compatible revision and retain additive data. Do not run
automatic down migrations, drop tables or delete uploads. Repair through an
explicit forward migration; backups are required before any exceptional destructive
operator recovery. Document each final SQL file/seed version when implemented.

<a id="obs"></a>

## OBS — Diagnostics and audit separation

Log requestId, stable action/result code, latency and safe operational failure
classification; never file bytes, SQL parameters, credentials, personal names,
emails or arbitrary request bodies. Audit records use the domain's allowlist.
Metrics aggregate failures, denied commands, upload reconciliation and notification
outcomes without account/tenant IDs as high-cardinality labels. Liveness is DB
independent; readiness remains a safe availability signal, not a diagnostic dump.

<a id="ux"></a>

## UX — Maintained controls and state model

Application route content inherits the shared 90rem canvas exactly once. Features
contain no theme implementation, custom colors, deep Shadow DOM styling or their
own shell. Angular 22 Signals own query, loaded DTO, form and view state; Zone.js
remains enabled. RxJS switchMap/cancellation is appropriate for HTTP concurrency.

Each app TDD selects one of these inspected choices:

- `UX-FP-DYNAMIC-PAGE`, NATIVE via existing `HcmDynamicPage`: real UI5 DynamicPage,
  DynamicPageTitle and DynamicPageHeader with title/actions, collapsible query
  context, native scrolling and overflow. Detail/edit stays in the same backed
  page or a native Dialog; no unapproved Object Page imitation.
- `UX-FP-STANDARD-PAGE`, NATIVE direct UI5 `Page`: existing maintained primitive
  with native `header` and optional `footer` slots. Use Bar/Title/Toolbar for header
  and footer content. This selects the native primitive, not the deferred generated
  standard/list-report library. Simple own-settings/read-only projection screens
  do not need collapsing headers.

No Object Page, generated List Report/Worklist or new reusable floorplan is selected.
App acceptance must verify the resulting composition; installed capability is not
a claim that future screens already passed accessibility or browser tests.

Explicit states: initial loading disables interactions; empty has an accurate
no-results/first-use message and permitted create action; error retains no stale
cross-context data and offers Retry; denied/unavailable do not issue protected
child requests; read-only exposes safe navigation with no mutation controls;
saving prevents duplicate submissions. Keep failed draft inputs, show field errors,
and offer reload after a revision conflict without silently discarding edits.

Forms use `form()`/`FormField` from `@angular/forms/signals` and maintained UI5
inputs via the already exercised CVA bridge. Do not assume CVA means a component
implements a native signal value-control API. Validate required/length/enumeration
constraints synchronously; uniqueness/authorization are server authoritative on
submit, with no speculative remote-validation endpoint. Labels link to controls,
errors identify fields, invalid submit focuses the first error. Unsaved navigation
and context changes use native confirmation; Cancel restores the loaded revision.
No autosave or persisted browser drafts. Non-editable fields stay display values;
do not enable fields merely to bypass validation. Native Dialog handles focus trap,
Escape and focus return; destructive/security actions require explicit confirmation.

Each table declares mode, query, pagination and columns in its app TDD. Native UI5
Table `overflowMode='Popin'` retains secondary fields with labels on narrow screens;
stable rowKey and primary label stay visible. Use native single-row actions; no
bulk actions, virtualizer, personalization or export in this stage. Native growing
button requests the next server cursor; do not download all data and paginate in
the browser. Bounded client collections explicitly state their maximum inventory.

<a id="native"></a>

## NATIVE — Inspected implementation evidence

Inspected on 2026-09-24 in the current installed packages, not a web/React example.
Fundamental wrappers both 0.64.3; underlying UI5 webcomponents 2.26.0.

| Import entry                                                                                                                                 | Symbols / inspected capability                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori/page`                                                                                              | Page: header/footer slots, hideFooter, noScrolling                                                                                                                    |
| `@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page`, `/dynamic-page-title`, `/dynamic-page-header`                                       | DynamicPage, DynamicPageTitle, DynamicPageHeader; production wrapper imports inspected in `libs/hcm/web/ux/floorplans/dynamic-page/src/lib/dynamic-page.component.ts` |
| `@fundamental-ngx/ui5-webcomponents/table`, `/table-header-row`, `/table-header-cell`, `/table-row`, `/table-cell`, `/table-growing`         | Table and corresponding named wrappers; loading, noDataText, overflowMode Popin, ui5RowClick; growing/column public declarations inspected                            |
| `@fundamental-ngx/ui5-webcomponents/form`, `/form-item`, `/label`, `/input`, `/select`, `/option`, `/check-box`, `/text-area`                | Form, FormItem, Label, Input, Select, Option, CheckBox, TextArea; input/select CVA host integration, public value/state/change events                                 |
| `@fundamental-ngx/ui5-webcomponents/button`, `/toolbar`, `/toolbar-button`, `/bar`, `/title`, `/dialog`, `/message-strip`, `/busy-indicator` | Button, Toolbar, ToolbarButton, Bar, Title, Dialog, MessageStrip, BusyIndicator; native action/layout/feedback primitives                                             |
| `@fundamental-ngx/ui5-webcomponents/file-uploader`                                                                                           | FileUploader: accept, maxFileSize, ui5Change, ui5FileSizeExceed; client checks do not replace server byte/signature limits                                            |

Package declarations are in their `types/fundamental-ngx-*.d.ts` files. Existing
Dynamic Page example uses `FormField` on UI5 Input and labeled table pop-ins.
Use Form accessibleMode Edit for actual edits; avoid Display-form composition with
the known definition-list accessibility finding. Read-only values use native
Text/Title/Label or table cells within the native page. See the
[current capability matrix](../ux/floorplans/component-capability-matrix.md) and
[acceptance record](../ux/floorplans/validation.md), including unresolved Object
Page limitations. New shared adapters require production-backed Storybook stories.

<a id="test"></a>

## TEST — Required execution evidence at implementation

Every app traceability register names planned tests, not currently executed tests.
Unit tests cover decisions and DTO validation. PostgreSQL integration uses a
disposable DB and restricted roles with two tenants, two same-tenant subjects,
disabled actors, revoked grants, entitlement removal and transaction failure
injection. API tests use actual request-context resolution; direct forged DTOs and
headers cannot grant authority. Browser tests use the local real API and seeded DB,
with Jim/Michael/Toby/David, not intercepted fake business responses.

UX checks cover 390/768/1440/2560 widths, Horizon light/dark and HER light/dark,
tenant overlay application/removal, keyboard-only forms/table/dialog actions,
visible labels/focus, loading/empty/error/denied/read-only/saving, and axe plus
manual focus review. Do not waive accessibility findings or transfer historical
pilot evidence to an untested app.

Before exposing an app: affected lint/test/build, tooling lint if changed,
architecture and page-structure checks, format/whitespace, migration/seed replay,
negative API/RLS tests and real browser evidence. Only then change implementation
status and regenerate catalogue projection. This design-only delivery does not run
migrations, seed, generate Nx projects or activate routes.
