# Domain Configuration — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `DOMAIN_CONFIGURATION`; owner `identity-access`; HCM-1 local stage.

## SCOPE

Read the current Account-owned hostname projection used by the HCM runtime.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-IDENTITY-ACCESS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Show the exact hostnames/tenant state known to runtime with a source label.
3. No register/verify/remove DNS or tenant lifecycle controls.
4. Missing hostname projection displays an unavailable/empty explanation and retry, not a fake configured state.

<a id="req-domain-configuration-001"></a>

## REQ-DOMAIN-CONFIGURATION-001 — Read current projection

Show the exact hostnames/tenant state known to runtime with a source label.

Acceptance: Data matches the existing persisted tenant directory, not fabricated domain verification.

<a id="req-domain-configuration-002"></a>

## REQ-DOMAIN-CONFIGURATION-002 — Keep configuration read-only

No register/verify/remove DNS or tenant lifecycle controls.

Acceptance: Mutation requests have no handler; foreign tenant selector is rejected.

<a id="req-domain-configuration-003"></a>

## REQ-DOMAIN-CONFIGURATION-003 — Explain unavailable data

Missing hostname projection displays an unavailable/empty explanation and retry, not a fake configured state.

Acceptance: Simulate missing projection and DB failure independently; 503 is not converted to an empty success.

<a id="req-domain-configuration-004"></a>

## REQ-DOMAIN-CONFIGURATION-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.identity-access and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-domain-configuration-005"></a>

## REQ-DOMAIN-CONFIGURATION-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-domain-configuration-006"></a>

## REQ-DOMAIN-CONFIGURATION-006 — Persist and attribute correctly

Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Tenant slug and state; current hostname list; source label Account projection.

Query behavior: Bounded projection for current tenant; no search/filter/pagination needed and no external DNS lookup.

No editable business form. Read-only values and safe navigation/download actions only; do not show an inert Save button.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
