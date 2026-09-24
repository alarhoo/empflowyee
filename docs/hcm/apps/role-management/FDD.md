# Role Management — functional design

Status: admitted local-stage implementation; the product-owner UX revision is recorded in DECISIONS.md.

App `ROLE_MANAGEMENT`; owner `access-control`; HCM-1 local stage.

## SCOPE

Inspect system roles and maintain custom tenant roles from registered permissions.

Actors: Tenant administrators (David through persisted grants).

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-ACCESS-CONTROL.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Opening shows persisted seeded roles and registered discovery/business permissions without treating discovery as authorization.
3. Create/edit a non-system role with a trimmed unique label and registered permission codes; saving with a reason returns the new revision.
4. System roles cannot be edited/deleted; an assigned custom role cannot be deleted.

<a id="req-role-management-001"></a>

## REQ-ROLE-MANAGEMENT-001 — Inspect roles

Opening shows persisted seeded roles and registered discovery/business permissions without treating discovery as authorization.

Acceptance: David lists roles; Jim is denied even if the tile is exposed by inspection.

<a id="req-role-management-002"></a>

## REQ-ROLE-MANAGEMENT-002 — Maintain a custom role

Create/edit a non-system role with a trimmed unique label and registered permission codes; saving with a reason returns the new revision.

Acceptance: Create, reload and edit a custom role; reject duplicate label, unknown permission and stale revision.

<a id="req-role-management-003"></a>

## REQ-ROLE-MANAGEMENT-003 — Protect active administration

System roles cannot be edited/deleted; an assigned custom role cannot be deleted.

Acceptance: Attempt protected edits, flag injection and deletion of an assigned role; no row or audit success is committed.

<a id="req-role-management-004"></a>

## REQ-ROLE-MANAGEMENT-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-role-management-005"></a>

## REQ-ROLE-MANAGEMENT-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-role-management-006"></a>

## REQ-ROLE-MANAGEMENT-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Use native FCL with a begin-column list and mid-column role Object Page. Sections are Overview, Permissions, Assignees and History / Audit. Assignment membership belongs to ACCESS_ASSIGNMENTS; audit history requires separate audit authority.

Display: Role label; system/protected status; permission count; assignee count; revision.

Query behavior: q matches label; filter systemRole; sort label asc (default) or desc, then id.

Label and permission multiselection; permission options grouped by kind, exact code/description visible; required reason. Create/Edit use dedicated routed Dynamic Pages (`new` and `:id/edit`) for the substantial permission editor. Dirty Cancel/leave confirms before discarding. No system-role mutation controls.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
