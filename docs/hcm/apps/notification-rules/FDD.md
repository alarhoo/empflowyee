# Notification Rules — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `NOTIFICATION_RULES`; owner `notifications`; HCM-1 local stage.

## SCOPE

Enable or disable in-app delivery for supported event types.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-NOTIFICATIONS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Show the supported event and its documented recipient resolution; no editable target list.
3. Enable/disable with reason/revision; no external destination, custom condition or new rule type.
4. A disabled tenant rule suppresses all matching future events; an enabled rule still checks recipient preference.

<a id="req-notification-rules-001"></a>

## REQ-NOTIFICATION-RULES-001 — Inspect fixed recipients

Show the supported event and its documented recipient resolution; no editable target list.

Acceptance: Document submitted targets requesting HR account; requested/replacement target linked enabled worker accounts.

<a id="req-notification-rules-002"></a>

## REQ-NOTIFICATION-RULES-002 — Toggle delivery

Enable/disable with reason/revision; no external destination, custom condition or new rule type.

Acceptance: Concurrent toggle conflict and unauthorized edits preserve existing rule.

<a id="req-notification-rules-003"></a>

## REQ-NOTIFICATION-RULES-003 — Respect preferences

A disabled tenant rule suppresses all matching future events; an enabled rule still checks recipient preference.

Acceptance: Preference true does not override disabled rule; prior inbox data remains unchanged.

<a id="req-notification-rules-004"></a>

## REQ-NOTIFICATION-RULES-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-notification-rules-005"></a>

## REQ-NOTIFICATION-RULES-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-notification-rules-006"></a>

## REQ-NOTIFICATION-RULES-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Event label; enabled state; fixed recipient explanation; revision.

Query behavior: Client mode exactly three event rules; no arbitrary conditions, pagination or recipient search.

Single rule Enable/Disable native confirmation with reason; no rule-builder canvas.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
