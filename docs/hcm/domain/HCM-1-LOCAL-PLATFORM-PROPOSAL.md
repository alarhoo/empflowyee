# HCM-1 local platform proposal

Status: **draft for business review**. These are concrete recommended choices,
not approved business rules or an implementation contract. See
[the decision register](../roadmap/HCM-1-DECISIONS.md) and
[the app scope](../roadmap/HCM-1-LOCAL-DELIVERY.md).

## Existing ownership and boundaries

Extend the [approved minimal spine](PLATFORM-SPINE.md). Account continues to own
commercial entitlements, hostnames and tenant lifecycle. HCM reads their existing
local projections; this work does not authorize HCM to edit Account-owned truth.

Keep `hcm_db.hcm`, SQL-first migrations and Kysely. Reuse existing workforce and
account keys. No employment lifecycle or effective dating is inferred. Tenant
context comes from the verified runtime request, never a client-supplied tenant ID.
Production authentication remains fail-closed; development impersonation remains
limited to the existing explicitly enabled local boundary.

## Proposed authority matrix

These are development grants for review, not hardcoded name checks in features.
Persist permission grants against roles; server-side policy applies equally to
future verified production session contexts. An entitlement permits a capability
to exist but does not authorize an account to operate it.

| Capability                                                               | Employee / Jim | Manager / Michael | HR Operations / Toby | Tenant Administrator / David         |
| ------------------------------------------------------------------------ | -------------- | ----------------- | -------------------- | ------------------------------------ |
| Own security summary, activity and notification preferences              | Own account    | Own account       | Own account          | Own account                          |
| Own shared documents and requested uploads                               | Own person     | Own person        | Own person           | Own person                           |
| Role management, assignments, identity administration and access reviews | None           | None              | None                 | Tenant scope                         |
| Catalogue and hostname projection administration views                   | None           | None              | None                 | Tenant scope, read-only projections  |
| Tenant audit/export/sensitive-access logs                                | None           | None              | None                 | Safe metadata only                   |
| Document types/templates and worker documents/requests                   | None           | None              | Tenant scope         | No automatic document-content access |
| In-app notification templates and rules                                  | None           | None              | None                 | Tenant scope                         |

Managers gain no access to other workers merely through the manager persona: the
foundation has no approved reporting-line scope. HR access to all tenant workers
is an explicit proposal requiring approval. Administration does not automatically
grant HR document visibility. An administrator capable of granting roles can
delegate HR privileges; that privileged action is audited. This is not a
separation-of-duties or independent-approval control.

## Proposed access behavior

Use distinct business permissions, for example `hcm.access-control.roles.read`,
`hcm.access-control.roles.manage`, `hcm.access-control.assignments.manage`,
`hcm.identity-access.accounts.manage` and `hcm.documents.self.read`. Final app
contracts enumerate exact permission identifiers, entitlements and subject rules.
Do not interpret `hcm.catalogue.*.discover` as a business grant.

Recommended local policy:

- Protect the seeded tenant-administrator role and its critical administration
  grants. Custom roles may select only registered permissions; they cannot define
  new executable capabilities or bypass entitlements.
- Permit tenant administrators to delegate approved privileges within their own
  tenant, with a required reason and audit event. No dual approval in this stage.
- Reject disabling the last enabled tenant administrator or removing its final
  protected grant. Evaluate under a transaction lock so concurrent requests cannot
  each remove a different last administrator.
- Use revision-based updates; stale edits return a conflict instead of overwriting.
  Existing system roles are protected; custom-role deletion is rejected while
  assigned. Preserve existing history rather than deleting audit records.
- Account creation links an existing person and has no password, invitation or
  automatic development persona. Persona fixtures remain explicit seed tooling.
  Changing account enablement never alters employment records.
- Manual access reviews snapshot account-role grants, record retain/revoke and a
  reason, and close only when all snapshot entries are decided. Concurrent grant
  changes require re-review of affected entries. No scheduled campaign or legal
  certification semantics are implied.

## Proposed notifications

In-app only. Start with document requested, document submitted and document
replacement requested events from implemented document actions. Before those
producers exist, a real notification inbox may correctly be empty.

Recipients are the request's worker-linked enabled account or its requesting HR
account, as specified by each event contract. Do not fan out to every manager or
all HR users without a reviewed recipient rule. Missing recipient accounts do not
invent accounts or email delivery. Record the undeliverable local outcome for
diagnostics without exposing document contents.

Plain-text templates accept an allowlist of non-sensitive placeholders. No HTML,
script execution, arbitrary expression language, external links or remote assets.
Each optional in-app category can be disabled by the recipient. Required security
delivery is deferred rather than creating an unenforced “mandatory” channel.

Persist domain event and recipient notification intent atomically with the action.
Use a stable event/recipient key to prevent duplicate deliveries on retries.
Audit and notification persistence are separate records and retention decisions.

## Proposed documents and requests

Recommended initial local scope: PDF, PNG and JPEG, at most 10 MiB per file. Persist
file bytes in a domain-owned local storage directory/volume behind a storage port;
persist metadata, ownership and versions in PostgreSQL. This is a local adapter,
not an approved production document-storage or malware-scanning deployment.

Do not serve the directory statically. Generate opaque storage keys; never use a
client filename as a filesystem path. Verify size and actual file signatures,
reject unsupported content, use attachment downloads with safe filenames and
content-type headers, and authorize each upload/read/download independently.
Metadata and bytes need a reviewed staged-write/reconciliation design because a
filesystem write cannot share a PostgreSQL transaction. That technical design is
required before a document feature is admitted.

HR can upload worker-linked documents and explicitly mark a version employee
visible. Employees cannot see HR-only versions. Tenant administrators have no
implicit content grant. Employee uploads are limited to a request addressed to
their own linked person; no unrestricted worker-ID selector. A worker without an
account can have HR-managed documents but cannot receive an invented login.

Proposed request transitions:

1. HR creates an Open request for one worker and document type, with optional due date.
2. The linked employee submits a file, moving it to Submitted.
3. HR accepts it, moving it to Completed, or requests a replacement, moving it
   back to Open with a reason; previous versions remain attributable.
4. HR may cancel an Open or Submitted request with a reason; completed requests
   are not silently reopened or erased.

No approval chains, e-signature, legal compliance certification, mail merge,
automatic due-date escalation, public sharing or bulk exports in this stage.
No user-facing destructive deletion or automatic purge until retention is reviewed.
Versioning/replacement does not mean indefinite production retention is approved.

## Proposed audit and governance

Persist an append-only audit envelope containing tenant, event ID/time, actor
account, action, target type/opaque ID, outcome, request correlation ID and an
allowlisted change summary. Audit successful changes in the same transaction.
Do not store tokens, credentials, document bodies or arbitrary request/row JSON.

Denied actions use safe operational diagnostics and, when an authenticated tenant
exists, a separately designed failure event. Failure recording must not accidentally
commit a failed business mutation. Sensitive document downloads record access
before bytes are released; describe stream failures honestly rather than claiming
the entire file was received. Export logs only reflect real emitting exporters.

My Activity is an actor-filtered safe projection, not the entire tenant log with a
browser filter. Tenant log access does not grant document-content access. UI and
API pagination are server-owned, with bounded pages and stable ordering.

For local demonstration, keep history until the existing explicit local reset
procedure is invoked. This is a local operational limit only. Production retention,
legal holds, deletion rights and external archive policy remain unresolved and
must not be represented as finalized compliance behavior.

## Proposed persistence ownership

These are logical proposals, not executable migrations or finalized table names.
All tenant-owned additions require direct tenant ownership, tenant-consistent
foreign keys and ENABLE/FORCE RLS for non-owner runtime access.

| Owner           | Proposed records                                                                                           | Existing records reused                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| access-control  | Role protection/revisions; business permission classification; access-review snapshots and decisions       | access_role, access_permission, role_permission, account_role, tenant_entitlement |
| identity-access | Account change metadata only; no token/password/session table in this stage                                | user_account, person, development_persona                                         |
| audit           | Append-only action events and safe activity/export/sensitive-read projections                              | Verified runtime tenant and actor context                                         |
| notifications   | In-app notification, preference, template, rule and delivery-intent records                                | Account identity; approved domain event IDs                                       |
| documents       | Type, template/version, worker document/version, request and transition records; opaque storage references | person, worker, user_account                                                      |

Applied migration `000005_identity_access_spine.sql` only permits
`kind='catalogue-discovery'`. Extend that constraint with a new reviewed migration;
do not edit the applied file. Grant the runtime role only operations needed by
admitted commands. Audit records must not be updateable/deletable through normal
business APIs. New development seeds are explicit versioned modules, not altered
checksummed modules or frontend arrays.

## Runtime and Nx implementation direction

No new architectural layer, deployable or product boundary is proposed. Domain
libraries use the existing approved technical roles. Universal DTO contracts live
under the owning domain; transport adapts HTTP, application owns authorization and
commands, infrastructure adapts Kysely/storage. Cross-domain calls use explicit
ports/contracts with one transaction owner for atomic mutations, not imports of
another domain's database implementation.

For the first role-management slice, proposed roots are:

- `libs/hcm/contracts/access-control/` for separately designed DTOs.
- `libs/hcm/api/access-control/` for justified domain/application/infrastructure/
  transport/module projects, generated after admission.
- `libs/hcm/web/access-control/feature-role-management` (canonical feature root)
  and a domain-owned data-access library.
- Existing database migration/seed projects, runtime integration and audit-owned
  contracts/adapters required for that slice.

Final names, tags, imports and routes belong in app TDDs and blueprints. No project
is created by this proposal. `apps/hcm/api` composes modules and `apps/hcm/web`
composes lazy routes; neither owns policy, catalogue or data implementations.

The local persona header currently serves runtime reads. Before local business
requests are added, review a central same-origin HCM API context adapter, exact
endpoint scoping, origin/CORS protections for writes, and backend request-context
reuse. Features never branch on development mode or trust browser-supplied grants.
No mutation endpoint may be exposed by merely reusing a discovery DTO as authority.

## UI selection constraints

Use the maintained production Dynamic Page where its behavior fits, native tables
with server-owned query state, and Signal Forms for edits. Do not adopt the
review-blocked Object Page or deferred generated list floorplans. The
[floorplan catalogue](../ux/floorplans/README.md) and its current validation remain
authoritative; exact installed component evidence and responsive/accessibility
acceptance belong in each TDD before implementation.

No theme CSS, fake business fixtures, copied old feature implementation or new
visual hierarchy folders. Each app has one domain-owned feature even when placed
in multiple Spaces. Deferred apps continue to use the existing consistent Planned
experience, not new placeholder implementations.
