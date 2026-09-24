# Access Assignments — functional design

Status: approved local-stage scope; implementation authorized by the local-stage instruction and subsequent UX correction.

App `ACCESS_ASSIGNMENTS`; owner `access-control`; HCM-1 local stage.

## SCOPE

Inspect account roles and grant or revoke one role at a time with attributable reasons.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-ACCESS-CONTROL.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Read tenant accounts and their current roles from the database; disabled accounts remain visible to administrators.
3. Select an existing account and role, confirm the exact target and reason; update only that assignment and advance account revision.
4. Reject removal of the final enabled protected administrator; role changes affect the next verified request.

<a id="req-access-assignments-001"></a>

## REQ-ACCESS-ASSIGNMENTS-001 — Inspect current assignments

Read tenant accounts and their current roles from the database; disabled accounts remain visible to administrators.

Acceptance: Accounts without roles render an empty role collection, not an invented employee grant.

<a id="req-access-assignments-002"></a>

## REQ-ACCESS-ASSIGNMENTS-002 — Grant and revoke

Select an existing account and role, confirm the exact target and reason; update only that assignment and advance account revision.

Acceptance: Grant/revoke persists after reload; duplicate grant is conflict unless identical receipt replay.

<a id="req-access-assignments-003"></a>

## REQ-ACCESS-ASSIGNMENTS-003 — Preserve administrator continuity

Reject removal of the final enabled protected administrator; role changes affect the next verified request.

Acceptance: Race two final-admin revokes and an account disable; invariant holds and prior-context browser caches clear.

<a id="req-access-assignments-004"></a>

## REQ-ACCESS-ASSIGNMENTS-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-access-assignments-005"></a>

## REQ-ACCESS-ASSIGNMENTS-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-access-assignments-006"></a>

## REQ-ACCESS-ASSIGNMENTS-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Account display name; email; enabled state; role labels; revision.

Query behavior: q matches account displayName/email; enabled filter; sort displayName asc/desc then id.

Read-only account identity; a server-paginated role picker and required reason. Grant/Revoke use native confirmation dialogs; no mass replace or bulk action.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
