# App Catalogue Configuration — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `APP_CATALOGUE_CONFIGURATION`; owner `access-control`; HCM-1 local stage.

## SCOPE

Inspect canonical applications, placements and tenant entitlement/discovery projections without editing commercial configuration.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-ACCESS-CONTROL.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Show the full current canonical metadata with tenant entitlement projection; Planned and Available are distinct.
3. Optionally choose a tenant account and inspect effective discovery reasons from server grants and entitlements.
4. No UI/API edits to catalogue routes, placements, implementation status or Account-owned entitlements.

<a id="req-app-catalogue-configuration-001"></a>

## REQ-APP-CATALOGUE-CONFIGURATION-001 — Inspect canonical inventory

Show the full current canonical metadata with tenant entitlement projection; Planned and Available are distinct.

Acceptance: Verify 170 entries against the canonical generated projection, not hand-maintained business arrays.

<a id="req-app-catalogue-configuration-002"></a>

## REQ-APP-CATALOGUE-CONFIGURATION-002 — Explain discovery

Optionally choose a tenant account and inspect effective discovery reasons from server grants and entitlements.

Acceptance: Changing the selected account updates only the explanation and never impersonates it.

<a id="req-app-catalogue-configuration-003"></a>

## REQ-APP-CATALOGUE-CONFIGURATION-003 — Preserve source ownership

No UI/API edits to catalogue routes, placements, implementation status or Account-owned entitlements.

Acceptance: Attempt mutation methods and tenant/account injection; no corresponding transport mutation exists.

<a id="req-app-catalogue-configuration-004"></a>

## REQ-APP-CATALOGUE-CONFIGURATION-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-app-catalogue-configuration-005"></a>

## REQ-APP-CATALOGUE-CONFIGURATION-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-app-catalogue-configuration-006"></a>

## REQ-APP-CATALOGUE-CONFIGURATION-006 — Persist and attribute correctly

Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: App code/title; domain; implementation status; entitlement/enabled projection; placements; optional discoverability reason.

Query behavior: Client q on title/code/domain; domain/status/entitled filters; title or appCode sort. Bounded canonical inventory is currently 170 entries; no business dataset prefetch.

No editable business form. Read-only values and safe navigation/download actions only; do not show an inert Save button.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
