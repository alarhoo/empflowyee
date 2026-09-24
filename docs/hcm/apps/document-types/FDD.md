# Document Types — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `DOCUMENT_TYPES`; owner `documents`; HCM-1 local stage.

## SCOPE

Maintain document classifications without inventing retention or mandatory-document policy.

Actors: HR Operations; administrators only with explicitly delegated HR permission.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-DOCUMENTS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. List persisted tenant document types including disabled values for HR.
3. Create unique code and label; edit label/description/enabled only with revision and reason.
4. Disabled types prevent new documents/templates/requests while existing requests and downloads remain usable.

<a id="req-document-types-001"></a>

## REQ-DOCUMENT-TYPES-001 — Read classifications

List persisted tenant document types including disabled values for HR.

Acceptance: Other tenants and ungranted David cannot inspect content-administration lists.

<a id="req-document-types-002"></a>

## REQ-DOCUMENT-TYPES-002 — Maintain classification

Create unique code and label; edit label/description/enabled only with revision and reason.

Acceptance: Reject code edits, duplicate code, invalid characters and unauthorized writes.

<a id="req-document-types-003"></a>

## REQ-DOCUMENT-TYPES-003 — Disable without erasing history

Disabled types prevent new documents/templates/requests while existing requests and downloads remain usable.

Acceptance: Existing open request can still be fulfilled; no destructive delete endpoint or inferred retention rule.

<a id="req-document-types-004"></a>

## REQ-DOCUMENT-TYPES-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-document-types-005"></a>

## REQ-DOCUMENT-TYPES-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-document-types-006"></a>

## REQ-DOCUMENT-TYPES-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Immutable code; label; description; enabled state; revision.

Query behavior: q matches code/label; enabled filter; label asc/desc then id.

Native create/edit dialog: code on create only, label, description, enabled and reason; no retention or mandatory checkbox.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
