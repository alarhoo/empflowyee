# Tenant Access Reviews — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `TENANT_ACCESS_REVIEWS`; owner `access-control`; HCM-1 local stage.

## SCOPE

Record manual reviews of snapshotted account-role assignments without claiming continuous certification.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-ACCESS-CONTROL.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Start a review with label/reason and snapshot current assignment occurrences and account/role revisions.
3. Retain/revoke a pending item with reason; stale snapshots require explicit refresh. Revoke uses protected grant rules.
4. Close only after every item is decided and retained evidence still matches; clearly show snapshot time and out-of-scope later grants.

<a id="req-tenant-access-reviews-001"></a>

## REQ-TENANT-ACCESS-REVIEWS-001 — Create snapshot

Start a review with label/reason and snapshot current assignment occurrences and account/role revisions.

Acceptance: Concurrent grant writes cannot create a mixed snapshot; empty snapshot can be closed.

<a id="req-tenant-access-reviews-002"></a>

## REQ-TENANT-ACCESS-REVIEWS-002 — Review with current evidence

Retain/revoke a pending item with reason; stale snapshots require explicit refresh. Revoke uses protected grant rules.

Acceptance: Revoke/regrant same pair is detected through grantId; last-admin revoke fails without marking item decided.

<a id="req-tenant-access-reviews-003"></a>

## REQ-TENANT-ACCESS-REVIEWS-003 — Close bounded review

Close only after every item is decided and retained evidence still matches; clearly show snapshot time and out-of-scope later grants.

Acceptance: Retained grant changes prevent closure until refreshed/re-decided; Closed review is read-only.

<a id="req-tenant-access-reviews-004"></a>

## REQ-TENANT-ACCESS-REVIEWS-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-tenant-access-reviews-005"></a>

## REQ-TENANT-ACCESS-REVIEWS-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-tenant-access-reviews-006"></a>

## REQ-TENANT-ACCESS-REVIEWS-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Review label/status/created date; detail account/role labels, decision, stale flag, reason.

Query behavior: q matches review label; status filter; createdAt desc/asc then id. Items sort id asc, filter decision; no recursive client filtering.

Create label/reason; single-item decision and refresh confirmations; native page transitions between list and review items with Back. No scheduled campaign or bulk certification.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
