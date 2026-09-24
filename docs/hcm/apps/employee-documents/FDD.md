# Employee Documents — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `EMPLOYEE_DOCUMENTS`; owner `documents`; HCM-1 local stage.

## SCOPE

Maintain worker-linked document versions and explicitly share individual versions with the employee.

Actors: HR Operations with explicit document permissions.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-DOCUMENTS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Pick/search a real tenant worker; show metadata even when worker has no account.
3. Upload a new document/version with visibility default false; change sharing for one version with reason/revision.
4. Only explicit HR permissions grant worker-wide read/download; account admin alone is insufficient.

<a id="req-employee-documents-001"></a>

## REQ-EMPLOYEE-DOCUMENTS-001 — Locate worker documents

Pick/search a real tenant worker; show metadata even when worker has no account.

Acceptance: HR can select tenant workers without creating login/persona or requiring employment lifecycle.

<a id="req-employee-documents-002"></a>

## REQ-EMPLOYEE-DOCUMENTS-002 — Upload and share deliberately

Upload a new document/version with visibility default false; change sharing for one version with reason/revision.

Acceptance: New version does not implicitly expose old hidden versions; stale sharing edit conflicts.

<a id="req-employee-documents-003"></a>

## REQ-EMPLOYEE-DOCUMENTS-003 — Protect private content

Only explicit HR permissions grant worker-wide read/download; account admin alone is insufficient.

Acceptance: David without HR, Michael team guesses and cross-tenant IDs fail; every successful attachment authorization is audited.

<a id="req-employee-documents-004"></a>

## REQ-EMPLOYEE-DOCUMENTS-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-employee-documents-005"></a>

## REQ-EMPLOYEE-DOCUMENTS-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-employee-documents-006"></a>

## REQ-EMPLOYEE-DOCUMENTS-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Worker label; document label/type; version; employee-visible flag; file size/date.

Query behavior: q matches document label; workerId/typeId filters; label asc/desc then id; versions versionNumber desc then id.

Worker/type server pickers, label, native FileUploader, employee-visible CheckBox default false, reason; separate native sharing confirmation. No delete/bulk export.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
