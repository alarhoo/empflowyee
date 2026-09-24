# Employee Documents validation

Branch: `codex/hcm-1-employee-documents`.

## Implementation and review

The authorized UX matrix selects native FCL with a begin-column server filter/list
and mid-column approved Object Page (Overview/Versions). Complex creation uses a
dedicated Dynamic Page route. Native focused dialogs handle append and per-version
sharing, with Signal Forms, dirty-leave protection and stable failed-command retries.
The feature has no custom CSS, theme imports or fabricated business records.

Documents consumes a read-only workforce projection; workers need no login account.
The SQL-first migration adds two domain-owned tables with FORCE RLS, composite
references, restricted update columns and Ready-file constraints. Worker uploads
reuse the staged file coordinator, reservation adapter and audited attachment
transport extracted from Document Templates. Permissions and entitlement are
rechecked at each transaction boundary. Sharing changes one version revision and
never mutate immutable bytes or implicitly change other versions. There are no
self-service writes, manager/team scope or administrator content privileges.

Migration 000015 was explicitly applied to persistent hcm_db. Existing approved
HR discovery and business grants suffice; no artificial success history or new
persona grants are seeded. Real browser acceptance uploads and audit remain local.
See [private storage operations](../engineering/DOCUMENT-STORAGE.md).

## Verification

The complete real PostgreSQL/API suite passes 153 tests across 23 files. Seven new
worker-document cases cover real worker choices (including no-account identities),
HR-only access, forged workers, immutable bytes, download audit, per-version
sharing/revision conflicts, actor-bound retry, stable subject cursors, disabled-type
append, concurrent revisions, publication recovery and runtime RLS/immutable-column
constraints. Template/storage, role/assignment, audit and notification regressions
remain green after shared protocol extraction.

Live browser create/share/version/download, failed-network retry, dirty leave and
tenant-branding application/removal have passed. All four Horizon/HER variants pass at 390/768/1440/2560 for list, Object Page,
focused append and routed create, with zero axe violations and no outer overflow.
Captures in `.tmp/hcm-employee-documents` were visually reviewed. API/web production
builds, affected lint, formatting, 61 page templates, architecture, documentation,
15 factory tests and all 20 admitted readiness checks pass. Private storage inspection
reports no missing Ready bytes. My Documents, Document Requests and the six deferred
integration apps remain Planned.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts employee-documents.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Start API/web on 4402/4302 before browser acceptance. On hosts with Nx worker startup
issues use NX_DAEMON=false and NX_ISOLATE_PLUGINS=false. Migration/storage setup
remains an explicit operator action; ordinary API startup performs neither.
