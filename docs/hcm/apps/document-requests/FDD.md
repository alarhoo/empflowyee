# Document Requests — functional design

Status: complete for review; approved local business scope, document revision not yet approved.

App `DOCUMENT_REQUESTS`; owner `documents`; HCM-1 local stage.

## SCOPE

Request a file from a worker, accept a submission or request replacement using the approved manual lifecycle.

Actors: HR Operations manages tenant requests; all personas can read and submit only requests addressed to their own person.

Authoritative policy: [local-stage decisions](../../roadmap/HCM-1-DECISIONS.md) and [owning domain](../../domain/HCM-1-DOCUMENTS.md). Catalogue title remains provisional until release review; no rename is made here.

## JOURNEY

1. Enter through an implemented lazy route or permitted catalogue tile. Resolve current context and permission before loading protected data.
2. HR selects existing worker/type and optional due date; creates Open request and in-app requested event.
3. Addressed employee submits validated file only while Open; HR accepts Submitted or requests replacement with reason.
4. HR cancels Open/Submitted with reason; terminal states cannot be reopened. Previous submissions remain visible to their subject/HR.

<a id="req-document-requests-001"></a>

## REQ-DOCUMENT-REQUESTS-001 — Request a document

HR selects existing worker/type and optional due date; creates Open request and in-app requested event.

Acceptance: Worker without account still has persisted request and Undeliverable intent, never invented email delivery.

<a id="req-document-requests-002"></a>

## REQ-DOCUMENT-REQUESTS-002 — Submit and review

Addressed employee submits validated file only while Open; HR accepts Submitted or requests replacement with reason.

Acceptance: Open->Submitted->Completed and Submitted->Open paths persist exactly one event/version per receipt; foreign submitter denied.

<a id="req-document-requests-003"></a>

## REQ-DOCUMENT-REQUESTS-003 — Cancel and retain history

HR cancels Open/Submitted with reason; terminal states cannot be reopened. Previous submissions remain visible to their subject/HR.

Acceptance: Race cancel/submit or accept/replacement under revision; terminal writes fail with no partial file/business success.

<a id="req-document-requests-004"></a>

## REQ-DOCUMENT-REQUESTS-004 — Authorize independently

Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Acceptance: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

<a id="req-document-requests-005"></a>

## REQ-DOCUMENT-REQUESTS-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Acceptance: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

<a id="req-document-requests-006"></a>

## REQ-DOCUMENT-REQUESTS-006 — Persist and attribute correctly

Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Acceptance: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

## BUSINESS-DATA

Display: Request ID; worker (HR only); type; status; due date; latest submission; revision.

Query behavior: q matches request ID only; status/typeId/workerId filters on HR endpoint, status only on self; createdAt desc/asc then id; submissions versionNumber desc then id.

One domain feature with server-authorized Own requests and HR tenant scopes. Native controls show only permitted actions; create/transition dialogs and employee FileUploader. No generic workflow builder.

## EXCLUSIONS

Production authentication, external delivery, commercial entitlement editing, employee lifecycle, bulk export, destructive document/audit deletion and unlisted actions remain outside this app. Existing Planned apps are not implemented by navigation links.
