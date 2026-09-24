# Document Types validation

Branch: `codex/hcm-1-document-types`.

## Behavior and review

Document Types uses the approved native Dynamic Page, server-owned filters and
cursor table, and small focused create/edit dialogs. Immutable code, bounded
classification metadata and an explicit revision/reason protect edits. Signal
Forms retain failed input, dirty-close confirmation protects drafts, and same-key
retries reuse the command receipt. No feature CSS or frontend business fixtures.
The list contains the complete object metadata; it is not a dialog-based detail
workspace. Other document apps with version details will use FCL/Object Page.

Migration 000013 introduces tenant-owned classification and command receipt tables
with FORCE RLS, composite account references and column-limited update privileges.
The explicit `access.documents@1` forward seed adds approved HR discovery without
modifying applied foundation seeds. Toby has content authority; David's discovery
does not grant document permissions. Both scripts were applied to persistent hcm_db.
Create/update commit their classification, safe audit and receipt atomically.
Disabling prevents new aggregates through the shared domain policy. Existing
request fulfillment will be verified in the subsequent Document Requests slice;
no file workflow is claimed implemented here.

## Verification

The full PostgreSQL/API suite passes 131 tests across 20 files. Classification
cases cover strict input, immutable code, duplicate code, literal search and
bound cursors, stale revisions/concurrency, replay, rollback, current grants,
disabled actor/entitlement, actual foreign records, RLS and database privileges.
Prior runtime, access, audit and notification regressions continue to pass.

Three live browser cases pass: actual create/edit with offline retry, dirty close
and denied administrator content; all four Horizon/HER themes at
390/768/1440/2560 widths with zero axe violations and no outer overflow; and
persisted tenant accent application/removal with exact restoration. Native page
and dialog states were checked; captures in `.tmp/hcm-document-types` were visually
reviewed. Real disabled acceptance classifications and their audit remain in the
local database; they are not production seed fixtures.

Affected lint, web/API production builds, formatting, architecture, documentation,
56 page-template checks and all 20 admitted design-readiness checks pass. Existing
SQL-column camelcase warnings remain unchanged. Four other local document apps
and the six deferred integration apps remain Planned.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts document-types.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Run the local HCM API and web on 4402 and 4302 before browser tests. Set
`NX_DAEMON=false` and `NX_ISOLATE_PLUGINS=false` on hosts with Nx worker startup
issues. Apply migrations and seeds explicitly; ordinary API startup never does.
