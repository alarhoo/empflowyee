# Data Export Log — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `DATA_EXPORT_LOG`; owner `audit`; HCM-1 local stage.

## SCOPE

Inspect actual export events without implementing export generation.

Actors: Tenant administrators.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-AUDIT.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Inspect actual export events without implementing export generation. Rows come from the append-only store with safe DTO projection.
3. Filter and paginate using stable event ordering; no raw payload, document body or credential fields.
4. No export rows is the correct state while no exporters exist.

<a id="req-data-export-log-001"></a>

## REQ-DATA-EXPORT-LOG-001 — Read scoped evidence

Inspect actual export events without implementing export generation. Rows come from the append-only store with safe DTO projection.

Acceptance: Verify tenant scope and explicit tenant-log permission.

<a id="req-data-export-log-002"></a>

## REQ-DATA-EXPORT-LOG-002 — Inspect bounded results

Filter and paginate using stable event ordering; no raw payload, document body or credential fields.

Acceptance: Test date boundaries, equal timestamps, malformed cursors and forbidden summary keys.

<a id="req-data-export-log-003"></a>

## REQ-DATA-EXPORT-LOG-003 — Handle absent or incomplete evidence

No export rows is the correct state while no exporters exist.

Acceptance: No seeded fictional history appears as actual activity; no edit/delete/export action exists.

<a id="req-data-export-log-004"></a>

## REQ-DATA-EXPORT-LOG-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.audit and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-data-export-log-005"></a>

## REQ-DATA-EXPORT-LOG-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-data-export-log-006"></a>

## REQ-DATA-EXPORT-LOG-006 — Persist and attribute correctly

Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Export action; actor; target type/ID; outcome; timestamp.

Query behavior: Server from/to/action/outcome filters; sort occurredAt desc (default) or asc then id. No free-text q for logs; reject unsupported q instead of searching arbitrary JSON.

No editable business form. Read-only values and safe navigation/download actions only; do not show an inert Save button.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
