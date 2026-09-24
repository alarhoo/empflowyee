# Notification Templates — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `NOTIFICATION_TEMPLATES`; owner `notifications`; HCM-1 local stage.

## SCOPE

Maintain plain-text in-app templates for the three supported document events.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-NOTIFICATIONS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. List one actual configured template per registered event with safe defaults from seed tooling.
3. Edit bounded title/body using requestId/dueDate placeholders; preview text only and save with reason/revision.
4. Template edits affect later deliveries, leaving existing inbox bodies unchanged.

<a id="req-notification-templates-001"></a>

## REQ-NOTIFICATION-TEMPLATES-001 — Inspect supported templates

List one actual configured template per registered event with safe defaults from seed tooling.

Acceptance: No email/HTML template or fake notification appears.

<a id="req-notification-templates-002"></a>

## REQ-NOTIFICATION-TEMPLATES-002 — Edit and preview plain text

Edit bounded title/body using requestId/dueDate placeholders; preview text only and save with reason/revision.

Acceptance: Reject unknown placeholders, URL-like external links, tags and control characters; preview never sends.

<a id="req-notification-templates-003"></a>

## REQ-NOTIFICATION-TEMPLATES-003 — Preserve sent evidence

Template edits affect later deliveries, leaving existing inbox bodies unchanged.

Acceptance: Deliver then edit and verify immutable prior inbox content plus audit field-name summary.

<a id="req-notification-templates-004"></a>

## REQ-NOTIFICATION-TEMPLATES-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-notification-templates-005"></a>

## REQ-NOTIFICATION-TEMPLATES-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-notification-templates-006"></a>

## REQ-NOTIFICATION-TEMPLATES-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Event label; title; body; revision; allowed placeholder help.

Query behavior: Client mode over exactly three registered templates; label/eventType sorting only; no pagination or arbitrary template creation.

Native Dialog with Input title and TextArea body, placeholder help, read-only text preview and reason. No expression editor or rich-text component.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
