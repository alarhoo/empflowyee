# My Documents — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `MY_DOCUMENTS`; owner `documents`; HCM-1 local stage.

## SCOPE

Read and download only documents explicitly visible to the current person.

Actors: Every enabled persona with self-document permission.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-DOCUMENTS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. Show only Ready employee-visible versions linked to the verified person, and no hidden-version counts.
3. Authorize again on every download; stream attachment only after sensitive-read audit.
4. No HR-only templates, unrestricted upload, delete or team documents. Own request submissions stay in Document Requests.

<a id="req-my-documents-001"></a>

## REQ-MY-DOCUMENTS-001 — Read explicit sharing

Show only Ready employee-visible versions linked to the verified person, and no hidden-version counts.

Acceptance: Account with no worker link gets honest empty; another account/person cannot be selected.

<a id="req-my-documents-002"></a>

## REQ-MY-DOCUMENTS-002 — Download own version

Authorize again on every download; stream attachment only after sensitive-read audit.

Acceptance: Revoke sharing after list then download: 404; no stale list authorization bypass.

<a id="req-my-documents-003"></a>

## REQ-MY-DOCUMENTS-003 — Keep employee scope bounded

No HR-only templates, unrestricted upload, delete or team documents. Own request submissions stay in Document Requests.

Acceptance: No filename/metadata leak for hidden versions and no implied manager access.

<a id="req-my-documents-004"></a>

## REQ-MY-DOCUMENTS-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-my-documents-005"></a>

## REQ-MY-DOCUMENTS-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-my-documents-006"></a>

## REQ-MY-DOCUMENTS-006 — Persist and attribute correctly

Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Document label/type; visible version; filename; file size; created date.

Query behavior: q matches authorized document label; typeId filter; label asc/desc then id; versions versionNumber desc then id. No worker/person selector.

No editable business form. Read-only values and safe navigation/download actions only; do not show an inert Save button.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
