# My Notification Preferences — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `MY_NOTIFICATION_PREFERENCES`; owner `notifications`; HCM-1 local stage.

## SCOPE

Control own optional in-app notification categories.

Actors: Every enabled persona, own account only.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-NOTIFICATIONS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Show requested/submitted/replacement-requested categories only; absent stored preference defaults enabled.
3. Save one category explicitly; first save accepts expectedRevision 0 and stores revision 1.
4. Saved choices affect future event delivery, not existing inbox rows or tenant-disabled rules.

<a id="req-my-notification-preferences-001"></a>

## REQ-MY-NOTIFICATION-PREFERENCES-001 — Read supported choices

Show requested/submitted/replacement-requested categories only; absent stored preference defaults enabled.

Acceptance: No email, mandatory alert or unsupported event preference is advertised.

<a id="req-my-notification-preferences-002"></a>

## REQ-MY-NOTIFICATION-PREFERENCES-002 — Save own choice

Save one category explicitly; first save accepts expectedRevision 0 and stores revision 1.

Acceptance: Reload verifies disabled choice; concurrent first saves conflict without duplicate rows.

<a id="req-my-notification-preferences-003"></a>

## REQ-MY-NOTIFICATION-PREFERENCES-003 — Apply at delivery time

Saved choices affect future event delivery, not existing inbox rows or tenant-disabled rules.

Acceptance: Suppressed future event creates an intent outcome and no inbox item; old notifications remain.

<a id="req-my-notification-preferences-004"></a>

## REQ-MY-NOTIFICATION-PREFERENCES-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-my-notification-preferences-005"></a>

## REQ-MY-NOTIFICATION-PREFERENCES-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-my-notification-preferences-006"></a>

## REQ-MY-NOTIFICATION-PREFERENCES-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Three supported event labels; enabled choice; local in-app channel explanation.

Query behavior: Client mode, exactly three registered event categories; no pagination/search/filter/selection.

Three labeled native CheckBox controls; per-category Save/Cancel on changed state; Signal Forms draft and conflict feedback. No silent autosave.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
