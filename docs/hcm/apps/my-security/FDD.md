# My Security — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `MY_SECURITY`; owner `identity-access`; HCM-1 local stage.

## SCOPE

Show the current account identity, role labels and explicit development-session context.

Actors: Every enabled persona, own account only.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-IDENTITY-ACCESS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Resolve identity exclusively from verified context and show persisted account fields.
3. Display assigned role labels and explain that role visibility is not proof of permission to every app.
4. Clearly label local development persona mode; do not show working password/MFA/revoke controls.

<a id="req-my-security-001"></a>

## REQ-MY-SECURITY-001 — Read own identity

Resolve identity exclusively from verified context and show persisted account fields.

Acceptance: Supplying another accountId is rejected; a disabled account cannot obtain a summary.

<a id="req-my-security-002"></a>

## REQ-MY-SECURITY-002 — Understand granted roles

Display assigned role labels and explain that role visibility is not proof of permission to every app.

Acceptance: Changing a role grant changes the next load; no browser fixture role list.

<a id="req-my-security-003"></a>

## REQ-MY-SECURITY-003 — Describe local limitations honestly

Clearly label local development persona mode; do not show working password/MFA/revoke controls.

Acceptance: No production-session security claim and no fake Active Sessions link marked Available.

<a id="req-my-security-004"></a>

## REQ-MY-SECURITY-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.identity-access and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-my-security-005"></a>

## REQ-MY-SECURITY-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-my-security-006"></a>

## REQ-MY-SECURITY-006 — Persist and attribute correctly

Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Own name/email/enabled state; session mode and expiry; own role labels.

Query behavior: Summary is singleton; roles server-paginated, label asc then id, q matches label; no other-account picker.

No editable business form. Read-only values and safe navigation/download actions only; do not show an inert Save button.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
