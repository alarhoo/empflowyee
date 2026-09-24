# HCM-1 identity-access design

Status: complete design for review under the approved local authority matrix.
Incorporates [shared technical contracts](../tdd/TDD-HCM-1-LOCAL-COMMON.md).

<a id="policy"></a>

## POLICY — Account lifecycle scope

David's administrator role can inspect accounts, create an enabled account for an
existing tenant person, and enable/disable an account with a reason. Account
creation requires email but creates no credentials, login invitation, persona or
role membership. The chosen person need not have an active employment; no employment
lifecycle is inferred. Do not enforce one account per person: the existing model
does not define that cardinality. Unique email within a tenant remains enforced.

Names are read from person, not independently edited in Identity Administration.
Email edits, person relinking, account deletion, passwords and MFA are not actions
in this bounded app. Email is trimmed and case-insensitively unique, maximum 254
characters with basic syntax validation; no verification/delivery claim. Enabling
an account does not grant roles. Disabling preserves roles, history and documents
and is rejected for the last enabled protected administrator.

My Security displays only the verified current account's summary and role labels,
with explicit development-session context and no claims of MFA/session security.
Domain Configuration reads Account-owned hostname data, not an editable DNS form.

<a id="data"></a>

## DATA — Existing records and forward changes

Reuse user_account/person/account_role and runtime hostname/tenant projection.
The existing account revision is shared with grant changes. Add created_at,
updated_at, created_by_account_id and updated_by_account_id with nullable actor
backfill for foundation seeds. Use tenant-consistent person/actor FKs and runtime
SELECT/INSERT plus column-restricted UPDATE for enabled/revision/update metadata;
no DELETE or password/credential storage. Account email constraint/index remains.
Add identity_command_receipt for idempotency, under the common RLS contract.

Paginated person-picker projection is `{id,displayName}` only, scoped to the tenant
and account-manage permission, enabling account creation without implementing the
Employee Directory app. Workforce owns records; identity infrastructure uses an
explicit read-only person lookup port bound by module composition. HCM identity
code does not create or mutate workforce records.

The consumer-owned application port has `listPeople(query)` returning
`Page<{id,displayName}>` and `requirePerson(id)` returning `{id}` or not-found,
within the caller's verified tenant unit of work. The identity infrastructure
adapter projects only these approved HCM-0 person columns through Kysely; it does
not import another domain's implementation. No new workforce app, HCM-2 API or
unapproved employment rule is a prerequisite for this small lookup contract.

<a id="contract"></a>

## CONTRACT — Identity and projection DTOs

AccountSummary `{id,personId,displayName,email,enabled,revision,createdAt}`;
AccountDetail adds paginated assigned-role summaries through access-control's
contract. CreateAccount `{personId,email,reason}`; SetAccountEnabled
`{enabled,expectedRevision,reason}`. Commands append audit with opaque target ID
and enabled-state changes, without copying email/name into change JSON.

SecuritySummary `{accountId,displayName,email,enabled,sessionMode,expiresAt}` and
own-role `Page<{id,label}>`; sessionMode is `local-development` for this adapter,
not a persisted production-authentication assertion. Resolve self from context.

DomainProjection `{hostnames:[{hostname}],tenantSlug,tenantStatus,source:'account-projection'}`.
Only current HCM-local hostname projection fields are exposed; no provider secrets,
internal connection data or assumed verification timestamps. An empty hostname
list reports unavailable projection data, not permission to add a new host.

The existing tenant_hostname table is the explicitly global routing index, not a
new tenant table. This projection must filter its tenant_id using the verified
tenant context before returning rows; do not expose the full global index or
change its existing ownership/RLS classification.

<a id="dependencies"></a>

## DEPENDENCIES — Trust boundary remains unchanged

Reuse runtime tenant/context verification and access-control last-admin invariant
under the tenant lock. Disabled accounts fail the next request; no persistent
session table or revocation UI is invented. Update the local-session ADR's command
scope alongside the future reviewed runtime adapter extension. No production auth
mechanism, token lifetime rule or provider design is introduced by these DTOs.

<a id="test"></a>

## TEST — Domain proof obligations

Create with duplicate differently cased email, missing/foreign person, malformed
input and forged persona must fail. Disable/re-enable preserves employment and
role rows; disabling the last administrator fails under concurrent grant revocation.
My Security rejects other-account selection and Domain Configuration has no write
transport route. An unconfigured production runtime still returns no verified session.
