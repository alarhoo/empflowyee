# HCM-1 local platform delivery

Status: **20-app local stage approved; business policies and app designs pending**.
Catalogue inspected on 2026-09-24. HCM-1 contains 26 planned applications in five
application-owning domains. None currently has an approved app blueprint.

The confirmed scope excludes production authentication and external integrations.
The approved local stage below makes that boundary concrete. Its business behavior
still requires the pending decisions in
[the review register](HCM-1-DECISIONS.md). The
[local platform proposal](../domain/HCM-1-LOCAL-PLATFORM-PROPOSAL.md) defines the
suggested data, permissions and interactions for review.

## Existing foundation

Reuse the persisted tenant, workforce identities, accounts, roles, discovery grants,
entitlements and Dunder Mifflin personas. Reuse the NestJS runtime contracts,
transaction-scoped Kysely infrastructure, migrations/seeds, catalogue projection,
shell, theme service and lazy navigation. Do not recreate those foundations.

The HCM-0 account-role grants authorize catalogue discovery only. New business APIs
need separately approved permissions and subject checks. The current runtime role
has SELECT grants, not general mutation authority. Extending it requires reviewed
forward migrations and negative authorization tests.

## Scope reconciliation

The [approved roadmap exception](HCM-DELIVERY-WAVES.md#approved-hcm-1-local-stage-exception)
resolves the conflict between the all-app wave rule and deferred integrations.
Do not mark deferred designs approved or weaken the app readiness checker.

**Approved exception:** review the 20-app local stage as a named delivery stage,
requiring all its FDDs, TDDs, contracts and blockers to be resolved before its first
implementation slice. Keep the six deferred apps in HCM-1 and Planned. Full HCM-1
completion and the full-wave gate remain blocked until the deferred stage is
designed and delivered. DEC-HCM1-001 records the explicit product-owner approval
on 2026-09-24. This is scope approval, not approval of the remaining business rules
or individual app designs.

Workflow and governance appear in the roadmap's primary domains but own no apps in
the HCM-1 catalogue. Treat them as prerequisite policy/contracts when needed. Do
not invent extra apps or bring HCM-3 approval routing or HCM-8 compliance workflows
into this stage.

## Proposed app coverage

This table accounts for each canonical HCM-1 app exactly once. “Local” is approved
stage membership, not Available status. The bounded behavior below remains subject
to business and app-design review. All apps remain Planned until their actual acceptance
criteria pass. Read-only scope is explicit where a source of truth lives elsewhere.

| App code                    | Owner           | Stage    | Proposed bounded outcome                                                                                                     |
| --------------------------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ROLE_MANAGEMENT             | access-control  | Local    | Read roles and approved permissions; create and edit custom tenant roles; protect the bootstrap administrator role.          |
| ACCESS_ASSIGNMENTS          | access-control  | Local    | Grant/revoke account roles with last-administrator protection and an audit reason.                                           |
| APP_CATALOGUE_CONFIGURATION | access-control  | Local    | Inspect catalogue entries, effective discovery grants and entitlement projections; no local commercial entitlement editor.   |
| TENANT_ACCESS_REVIEWS       | access-control  | Local    | Persist manual review snapshots and retain/revoke decisions; no certification claim or automated expiry.                     |
| AUDIT_LOG                   | audit           | Local    | Search allowlisted records of implemented HCM business actions.                                                              |
| MY_ACTIVITY                 | audit           | Local    | Read the current account's own safe activity projection.                                                                     |
| DATA_EXPORT_LOG             | audit           | Local    | Read recorded export events; honestly empty while no implemented exporter emits events. No new exporter.                     |
| SENSITIVE_ACCESS_LOG        | audit           | Local    | Read document-access events emitted by implemented document APIs.                                                            |
| IDENTITY_ADMINISTRATION     | identity-access | Local    | Inspect accounts; create an account for an existing person and enable/disable accounts; no invitation or credentials.        |
| DOMAIN_CONFIGURATION        | identity-access | Local    | Read current Account-owned hostname/projection; no domain registration, verification or reassignment.                        |
| MY_SECURITY                 | identity-access | Local    | Read own account state, assigned roles and explicit local-session mode; no password, MFA or session revocation controls.     |
| ACTIVE_SESSIONS             | identity-access | Deferred | Needs a reviewed persistent session authority and revocation semantics; local persona reads are not a session inventory.     |
| API_CREDENTIALS             | identity-access | Deferred | Credential creation, rotation, authentication and secret handling require a separate trust-boundary design.                  |
| SECURITY_POLICIES           | identity-access | Deferred | Password/MFA/session policy requires an enforcing authentication provider; do not store settings that have no effect.        |
| SSO_CONFIGURATION           | identity-access | Deferred | Production identity-provider integration remains out of scope.                                                               |
| MY_NOTIFICATIONS            | notifications   | Local    | Read own persisted in-app notifications and mark them read.                                                                  |
| MY_NOTIFICATION_PREFERENCES | notifications   | Local    | Persist own preferences for supported in-app event categories only.                                                          |
| NOTIFICATION_TEMPLATES      | notifications   | Local    | Manage plain-text in-app templates for approved event types and allowed placeholders.                                        |
| NOTIFICATION_RULES          | notifications   | Local    | Enable supported in-app event rules; recipients come from the event contract, not arbitrary expressions.                     |
| EMAIL_SENDER_CONFIGURATION  | notifications   | Deferred | Sender verification, provider secrets and delivery integration remain out of scope.                                          |
| OUTBOUND_WEBHOOKS           | notifications   | Deferred | External destinations, credentials, delivery/retry and SSRF policy remain out of scope.                                      |
| DOCUMENT_TYPES              | documents       | Local    | Maintain document classifications under the reviewed visibility and upload policy.                                           |
| DOCUMENT_TEMPLATES          | documents       | Local    | Store versioned reference files; no mail merge, e-signature or generated legal documents.                                    |
| EMPLOYEE_DOCUMENTS          | documents       | Local    | HR uploads, lists and downloads worker-linked documents using explicit worker visibility.                                    |
| MY_DOCUMENTS                | documents       | Local    | Read/download documents explicitly shared with the current account's person.                                                 |
| DOCUMENT_REQUESTS           | documents       | Local    | HR requests a document from a worker; the worker submits and HR accepts or requests replacement. No generic workflow engine. |

## Delivery sequence after design approval

Prepare app FDD/TDD/DECISIONS/TRACEABILITY and blueprints for the approved stage,
with reviewed shared contracts. Do not generate Nx projects for the planned
inventory. Generate each real project only when its admitted slice begins.

| Order | Coherent slice                                                          | Dependency and evidence                                                                                                                                   |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Business authorization and audit transaction contract                   | Approve the permission/subject matrix, local request propagation and audit envelope. Add forward SQL and seed versions, with RLS and denied-action tests. |
| 2     | Role Management                                                         | First vertical slice: persisted API list/edit, native UI, real development grants, audit event, concurrency and last-administrator tests.                 |
| 3     | Access Assignments and Identity Administration                          | Reuse approved role/account policies; account disable and grant changes affect the next verified request.                                                 |
| 4     | Catalogue Configuration, Domain Configuration and My Security           | Explicit read models over existing data, enforcing business read permissions.                                                                             |
| 5     | Audit Log, My Activity, Data Export Log and Sensitive Access Log        | Safe, paginated projections; no fabricated historic events. Document-access view may be empty until slice 9.                                              |
| 6     | Tenant Access Reviews                                                   | Versioned review snapshots; revocation invokes the same access-control command rather than writing grants directly.                                       |
| 7     | Notifications and preferences                                           | Persist events from implemented actions only, with deterministic recipient rules and idempotent in-app creation.                                          |
| 8     | Notification templates and rules                                        | Expose only supported event types after the delivery path exists.                                                                                         |
| 9     | Document Types, Document Templates, Employee Documents and My Documents | Approve file policy first; implement persistent storage, authorized download and sensitive-read audit before exposing upload.                             |
| 10    | Document Requests                                                       | Reuse document authorization, explicit request transitions and persisted in-app notifications.                                                            |

Each slice gets a granular `codex/` branch and coherent Conventional Commits. Do not
commit the whole stage as one implementation change. No production deployment is
part of this plan.

## Admission and acceptance

Before admitting the approved local stage, check every app in that stage using
`pnpm hcm:app:readiness --app=APP_CODE --check`. The full
`pnpm hcm:wave:context --wave=HCM-1 --check` must continue to report deferred apps
as blocked; it must not be cited as a successful full-wave check.

Every implemented slice must demonstrate:

- SQL-first forward migrations and explicit seed versions in persistent local
  PostgreSQL; applied SQL is immutable and API startup never migrates.
- Server-issued tenant context, RLS, same-tenant foreign keys, separate business
  permission checks and negative cross-tenant/subject/disabled-account tests.
- API DTOs separate from persistence, bounded pagination and stale-write handling.
- Atomic audit for successful writes; no synthetic success if persistence fails.
- Real Angular HTTP data, lazy domain-owned features and a thin application root.
- Maintained UI5/Fundamental controls, supported page/floorplan selection and the
  shared canvas; four themes, tenant-overlay removal, keyboard and responsive
  checks for reusable UX additions.
- Lint, format, architecture, tests and production builds appropriate to the
  changed projects; live persona tests in the browser against the real local API.
- Catalogue Available status only for genuinely implemented and validated routes.

## Current preparation evidence

The scope review found no approved HCM-1 FDD/TDD or blueprint. Existing foundation
evidence is linked from [app readiness](../engineering/APP-READINESS.md).
This document makes no app approval, migration, UI or completion claim.

Preparation checks on 2026-09-24:

- Matched all 26 app codes and owners against the canonical catalogue exactly
  once: 20 proposed local, six deferred, across five app-owning domains.
- Verified 50 relative link targets in the new documents and affected entry points.
- Documentation/catalogue projection, architecture, formatting and Git whitespace
  checks passed; all 15 factory/readiness tests passed.
- Full HCM-1 readiness returned exit 1 with 0 of 26 apps ready, as expected. No
  approval or implementation flags were changed to suppress that result.
- This change contains documentation only; no application build, migration or
  live runtime behavior is newly claimed as verified by these checks.
