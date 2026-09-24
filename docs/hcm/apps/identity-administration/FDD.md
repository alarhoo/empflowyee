# Identity Administration — functional design

Status: approved local implementation scope under the explicit 20-app implementation instruction.

App `IDENTITY_ADMINISTRATION`; owner `identity-access`; HCM-1 local stage.

## SCOPE

Manage enabled local account records linked to existing people without creating authentication credentials.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-IDENTITY-ACCESS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. List real person-linked accounts without changing workforce information.
3. Select an existing tenant person and unique email; create enabled account with no roles, invitation or persona.
4. Change enabled with a reason and revision while retaining roles/history; last administrator is protected.

<a id="req-identity-administration-001"></a>

## REQ-IDENTITY-ADMINISTRATION-001 — Inspect linked accounts

List real person-linked accounts without changing workforce information.

Acceptance: A person can exist without an account; no automatic account is synthesized.

<a id="req-identity-administration-002"></a>

## REQ-IDENTITY-ADMINISTRATION-002 — Create account record

Select an existing tenant person and unique email; create enabled account with no roles, invitation or persona.

Acceptance: Foreign/missing person and case-insensitive duplicate email fail; reload verifies real persistence.

<a id="req-identity-administration-003"></a>

## REQ-IDENTITY-ADMINISTRATION-003 — Enable and disable safely

Change enabled with a reason and revision while retaining roles/history; last administrator is protected.

Acceptance: Disabled persona fails the next request; enabling never silently grants permissions or changes employment.

<a id="req-identity-administration-004"></a>

## REQ-IDENTITY-ADMINISTRATION-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.identity-access and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-identity-administration-005"></a>

## REQ-IDENTITY-ADMINISTRATION-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-identity-administration-006"></a>

## REQ-IDENTITY-ADMINISTRATION-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Display name; email; enabled state; person linkage; revision.

Query behavior: q matches displayName/email; enabled filter; displayName asc/desc then id.

Create dialog: person picker, email, reason. Existing identity fields read-only; Enable/Disable confirmation only. No email edit, relink, credential or delete controls.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
