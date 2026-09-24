# My Notifications — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `MY_NOTIFICATIONS`; owner `notifications`; HCM-1 local stage.

## SCOPE

Read persisted own-account in-app notifications and mark individual items read.

Actors: Every enabled persona, own account only.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-NOTIFICATIONS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Only persisted notifications addressed to the verified account appear.
3. Mark an individual item read without deleting it; receipt retry preserves first read timestamp.
4. Document-request action is enabled only when its implemented route is discoverable; destination re-authorizes subject.

<a id="req-my-notifications-001"></a>

## REQ-MY-NOTIFICATIONS-001 — Read own inbox

Only persisted notifications addressed to the verified account appear.

Acceptance: Other account/tenant IDs and hidden recipient fields cannot enumerate another inbox.

<a id="req-my-notifications-002"></a>

## REQ-MY-NOTIFICATIONS-002 — Mark read

Mark an individual item read without deleting it; receipt retry preserves first read timestamp.

Acceptance: Reload and stale/repeated requests prove correct revision and timestamp behavior.

<a id="req-my-notifications-003"></a>

## REQ-MY-NOTIFICATIONS-003 — Navigate without bypass

Document-request action is enabled only when its implemented route is discoverable; destination re-authorizes subject.

Acceptance: An inbox before producer/route implementation is honestly empty or informational, never a fake business destination.

<a id="req-my-notifications-004"></a>

## REQ-MY-NOTIFICATIONS-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-my-notifications-005"></a>

## REQ-MY-NOTIFICATIONS-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-my-notifications-006"></a>

## REQ-MY-NOTIFICATIONS-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Title; body preview; event type; created date; read state.

Query behavior: q matches own title/body; unread/eventType filters; createdAt desc/asc then id.

No create/edit form; native row Mark read action and confirmation-free idempotent state change. Body rendered as text, never innerHTML.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
