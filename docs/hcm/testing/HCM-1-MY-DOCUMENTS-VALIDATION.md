# My Documents validation

Branch: `codex/hcm-1-my-documents`.

## Implementation and review

The native FCL keeps server filters/list in the begin column and the approved
Object Page (Overview/Versions) in the mid column. Selection is deep-linkable.
The feature has no worker selector, create/edit flow, custom CSS or fabricated data.

The self read adapter derives worker/person exclusively from the verified account.
Aggregates appear only when at least one Ready version is explicitly visible;
version pagination excludes hidden rows before limiting or generating cursors.
DTOs omit HR aggregate revisions, sharing revisions, worker/account IDs, storage
keys and hidden counts. Download rechecks current subject and version visibility,
opens verified bytes, and commits sensitive-access audit before exposing a stream.
The shared attachment helper is used by both HR and self read surfaces; the self
application has no upload or mutation port. No new table, migration or permission
grant is needed: this consumes the approved worker-document persistence and grants.

## Verification

The complete PostgreSQL/API suite passes 157 tests across 24 files. Four self-service
cases cover real HR-authored data, hidden-only objects/versions, other same-tenant
workers, no automatic HR/admin expansion, forbidden worker overrides and methods,
explicit DTO fields, per-version visibility revocation after an earlier read,
audited attachment bytes and audit-failure rollback before any bytes are released.
Existing template/worker/storage and all authority/notification regressions pass.

API/web production builds, affected lint, 62 page templates, architecture and all
20 admitted readiness checks pass. Three browser cases pass: actual self download,
hidden-version exclusion and revoked-sharing rejection; all four themes at
390/768/1440/2560 with zero axe violations and no outer overflow; persisted tenant
branding application/removal with exact restoration. Captures in `.tmp/hcm-my-documents`
were visually reviewed. The initial functional run began before API startup completed;
the completed rerun passes. Browser validation also found and corrected bounded JSON
error decoding for Blob download responses, shared by HR/template/self data access.
Formatting and documentation checks pass. Document Requests and the six deferred
integration apps remain Planned.

## Reproduction

```bash
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts my-documents.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Run the local API/web on 4402/4302 and prepare private storage as described in
[storage operations](../engineering/DOCUMENT-STORAGE.md). Use NX_DAEMON=false and
NX_ISOLATE_PLUGINS=false on hosts with Nx worker startup issues. Browser acceptance
records are authored through the real HR API and remain in local storage.
