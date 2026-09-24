# Document Templates — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `DOCUMENT_TEMPLATES`; owner `documents`; HCM-1 local stage.

## SCOPE

Manage versioned HR-only reference files for a document type.

Actors: HR Operations with explicit template permissions.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-DOCUMENTS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. HR lists templates and immutable versions; employee self-service has no template access.
3. Create or version with validated PDF/PNG/JPEG <=10 MiB through the staged upload protocol.
4. Stream an authorized immutable attachment with access audit, not mail merge/e-signature/public URL.

<a id="req-document-templates-001"></a>

## REQ-DOCUMENT-TEMPLATES-001 — Inspect reference versions

HR lists templates and immutable versions; employee self-service has no template access.

Acceptance: Jim and David without HR grants are denied, including guessed download IDs.

<a id="req-document-templates-002"></a>

## REQ-DOCUMENT-TEMPLATES-002 — Upload persistent file

Create or version with validated PDF/PNG/JPEG <=10 MiB through the staged upload protocol.

Acceptance: Crash/retry yields one Ready version only; reject disabled type for new template.

<a id="req-document-templates-003"></a>

## REQ-DOCUMENT-TEMPLATES-003 — Download without generation

Stream an authorized immutable attachment with access audit, not mail merge/e-signature/public URL.

Acceptance: Verify headers, persistent bytes/hash, denied foreign version and missing-file 503.

<a id="req-document-templates-004"></a>

## REQ-DOCUMENT-TEMPLATES-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-document-templates-005"></a>

## REQ-DOCUMENT-TEMPLATES-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-document-templates-006"></a>

## REQ-DOCUMENT-TEMPLATES-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Template label/type; revision; version number; filename; size; created date.

Query behavior: q matches template label; typeId filter; label asc/desc then id; versions versionNumber desc then id.

Native Dialog: type picker for create, label and FileUploader; version upload shows current revision and reason. Type/label remain unchanged on version append.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
