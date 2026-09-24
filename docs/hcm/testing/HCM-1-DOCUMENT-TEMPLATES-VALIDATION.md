# Document Templates validation

Branch: `codex/hcm-1-document-templates`.

## Behavior and review

The authorized UX matrix selects native FlexibleColumnLayout: the begin column
keeps server filters/list; the mid column uses the approved Object Page with
Overview and Versions. Exact selected-object GET and routed query selection avoid
scanning an unbounded collection. Small create/version dialogs use Signal Forms,
a maintained FileUploader and bounded real type choices. Failed drafts and retry
keys are retained; immutable type/label cannot change on append. No feature CSS,
custom controls or fake business records. HR discovery is delivered by forward
seed access.documents@2; administrator discovery never grants reference content.

Migration 000014 owns template/version/blob/reservation tables with FORCE RLS,
tenant-composite references, immutable version privileges, Ready-blob checks and
one-way file-state transitions. The real Kysely application uses explicit staged
and final transactions, preserving audit/receipt atomicity. Download authorization
and observed completion use the audit-owned append port. No public storage URL,
new authentication identity, runtime migration or file-content audit is introduced.
The migration and seed were applied to persistent hcm_db; the private root was
explicitly prepared and inspected. See [storage operations](../engineering/DOCUMENT-STORAGE.md).

## Verification

The full PostgreSQL/API suite passes 146 tests across 22 files. Nine template cases
cover actual HTTP multipart validation/limits, current HR grants, real private bytes,
immutable versions/replay, changed payload rejection, access-audit linkage, missing
bytes, crashes before/after rename, final audit rollback/retry, concurrent revisions,
disabled-type append, authority loss after publication, real foreign records and
runtime SQL/RLS/immutable-column constraints. The final malformed-boundary correction
also passes the nine-case API suite. Six filesystem cases cover exact 10 MiB,
signature/MIME/suffix agreement, unsafe names, junctions, hard links, interrupted
streams, corruption and restart publication. Existing role/assignment/runtime,
audit and notification regressions remain green.

Three live browser cases pass: actual create, failed-network retry, download and
second immutable version, dirty close and administrator denial; list/detail/upload
across all four Horizon/HER variants at 390/768/1440/2560 with zero axe violations
and no outer overflow; and persisted tenant accent application/removal with exact
restoration. Captures in `.tmp/hcm-document-templates` were visually reviewed.
Real acceptance templates, bytes and their audit remain in local storage.

Explicit maintenance was exercised with isolated unreferenced test files: inspection
reported the old orphan, cleanup removed it, and a recent file survived the 24-hour
grace period. Current Ready files remained present; inspection reported no missing
Ready files. The fresh test artifact was removed separately after the assertion.

Affected lint, web/API production builds, formatting, architecture, documentation,
58 page-template checks and all 20 admitted readiness checks pass. Existing
SQL-column camelcase warnings are unchanged. Employee Documents, My Documents,
Document Requests and all six deferred integration apps remain Planned.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:documents:inspect
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts document-templates.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Run API/web on 4402/4302 before browser acceptance. Use NX_DAEMON=false and
NX_ISOLATE_PLUGINS=false on hosts with Nx worker startup issues. Cleanup is an
explicit operator action, not a routine API startup step.
