# HCM-1 access-control design

Status: complete design for review under the approved local authority matrix.
Incorporates [shared technical contracts](../tdd/TDD-HCM-1-LOCAL-COMMON.md).

<a id="policy"></a>

## POLICY — Roles, delegation and protected access

Business permissions are explicit registered strings; discovery permissions remain
separate. All four seed personas retain their discovery grants. Business grants
are added by new seed modules: all personas receive self-service grants; David's
protected administrator role receives access/identity/notification-administration
and safe audit-log permissions; Toby's HR role receives document administration.
Michael has no team-data permission. No role automatically bypasses subject scope
or entitlements. App TDD permission tables are the exact register for this stage.

System roles and their permission sets cannot be edited/deleted through role APIs.
An administrator may create custom roles selecting registered discovery and
business permissions, and assign/revoke roles with a nonempty reason (1–500
characters). They cannot register permissions, edit entitlements or impersonate
an account. The four seed role labels are presentation, not authorization keys.
Persist `system_role` and `protected_admin` flags; only migration/seed tooling sets
them. Protected administrator role membership defines the last-administrator
invariant, not a client-supplied label or a custom role with similar permissions.

All role/grant/account-disable commands serialize through the tenant-scoped
transaction advisory lock defined by the common TDD,
re-authorize the actor, and retain at least one enabled account assigned a
protected-admin role. Revoke of one's own final admin access is allowed only when
another enabled protected administrator remains. New custom-role labels are
trimmed, 1–100 characters, case-insensitively unique per tenant. Deletion requires
an unassigned, non-system role and deletes its permission join rows atomically;
history keeps its stable ID/label snapshot. Unknown permission codes are rejected.

<a id="data"></a>

## DATA — Physical design

Extend access_role with `system_role boolean`, `protected_admin boolean`, positive
revision, created_at/updated_at and label uniqueness on `(tenant_id,lower(label))`.
Backfill existing seed identities explicitly; no label-based runtime inference.
Runtime INSERT/UPDATE column grants exclude system_role and protected_admin; new
custom roles receive false defaults. Only the migrator can set those flags.
Extend access_permission.kind to `catalogue-discovery | business-operation` with
a forward constraint migration. No runtime INSERT/UPDATE/DELETE permission on
access_permission, entitlement_definition or tenant_entitlement.

Reuse account_role and role_permission. Add `grant_id text` (immutable UUID per
assignment occurrence), granted_at and granted_by_account_id to account_role.
Revoke/regrant creates a new grant_id so a review can detect replacement even if
the account/role pair is identical. Advance user_account.revision whenever grants
change, serializing with identity account changes. Role revision changes when its
permission set changes. All references include tenant_id; preserve seed pair keys.

Add access_review: `(tenant_id,id)`, label (1–100), status Open/Closed, revision,
created_by_account_id, created_at, closed_at. Add access_review_item:
`(tenant_id,id)`, review_id, account_id, role_id, snapshotted grant_id,
role_revision, account_revision, safe account/role labels, decision Pending/Retain/Revoke/Removed,
decision_reason, decided_by_account_id, decided_at, revision. Use unique
`(tenant_id,review_id,grant_id)`. Snapshot references to removed grants/roles are
historical IDs, not cascading FKs; live account/review references remain tenant FKs.
Review deletion and arbitrary state PATCH are not exposed.

Starting a review takes the same tenant lock and snapshots existing account-role
assignments in one transaction. Empty review is valid and can be closed. Retain
requires the current assignment/role/account revision to match. Revoke uses the
same protected access command as Access Assignments, in the same unit of work.
Refresh an outdated item in an Open review replaces its snapshot and resets it Pending,
including an earlier Retain decision invalidated by later changes;
an already absent assignment is explicitly recorded as Removed with
reason, not silently revoked a second time. Closing rechecks retained snapshots;
new grants absent from the snapshot stay outside that review and are clearly
identified as outside scope. A completed review does not certify future access.

Add access_command_receipt per common API idempotency contract. Runtime needs
SELECT on its owned read models; bounded DML on roles/joins/reviews/receipts, not
global definitions. Index reviews by tenant/created_at/id and review items by
tenant/review_id/id. RLS and immutable successful audit apply to all commands.

<a id="contract"></a>

## CONTRACT — Shared read projections and command boundaries

RoleSummary `{id,label,systemRole,protectedAdmin,revision,permissionCount,assigneeCount}`;
RoleDetail adds `permissionCodes:string[]` (bounded by the registered catalogue).
PermissionOption `{code,description,kind,entitlement}` comes from the registered
permission definitions and explicit operation-to-entitlement map. No browser-owned
permission descriptions are trusted for writes.

Permission code lists reject duplicates and any code absent from the registered
inventory, and cannot exceed that inventory's cardinality. All managed command
arrays are bounded; role creation cannot use the API as an unbounded JSON store.

AssignmentSummary `{accountId,displayName,email,enabled,revision,roles:{items:[{id,label,grantId}],nextCursor}}`
is paginated by accounts, with the first 25 roles per row and further roles fetched
by the separate paginated account-role endpoint using nextCursor. Account-scoped mutation commands take
the account revision and never replace its full role list implicitly.

CatalogueEntry `{appCode,title,domain,status,route,discoveryPermission,entitlement,
entitled,placements}` combines the existing universal canonical catalogue with
tenant entitlement projection. Account details/grants are not broadcast in this
response. An optional account selection is separately permission-gated and returns
effective discoverability reasons computed by the same server-side discovery
predicate. It never modifies catalogue placement, commercial flags or status.

CatalogueEntry.route is string or null, status is the canonical implementation
status, and placements retain the canonical spaceId/pageId/sectionId/display
fields. Discovery reasons use `account-disabled`, `missing-discovery-permission`,
`missing-entitlement` and `no-role-placement`; an empty reason list means
discoverable, not implemented or business-authorized.

ReviewSummary `{id,label,status,revision,createdAt,closedAt}`; ReviewItem adds
`id,accountId,roleId,grantId,accountLabel,roleLabel,decision,reason,revision,stale`.
App TDDs define exact endpoint bodies and action permissions. Registry and catalogue
projections are immutable inputs, not new fixture business data.

<a id="dependencies"></a>

## DEPENDENCIES — Ports and implementation order

Own access decisions and cross-domain `AccessPolicy` / `AccountAccessInvariant`
application ports. Identity disable calls the invariant port under the same tenant
unit of work; it must not duplicate last-admin logic. Audit append is required
before any mutation app is exposed. Review revoke reuses access command policy.
No production IAM, SSO, Account licensing editor or generic approval workflow.

<a id="test"></a>

## TEST — Domain proof obligations

Race two revokes/disables against the final two administrators; exactly one can
remove access. Reject changing protected role flags, forging business permission
codes, cross-tenant role assignment, own-record permission escalation and role
deletion while assigned. Test revoke/regrant review drift, protected-review revoke,
empty review closure, retained-item drift and transaction rollback on audit failure.
