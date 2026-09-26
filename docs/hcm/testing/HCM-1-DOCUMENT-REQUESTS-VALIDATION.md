# Document Requests implementation validation

Branches: `codex/hcm-1-document-requests` (implementation) and
`codex/hcm-1-document-requests-release` (notification scope and release).

## Implemented

SQL migration 000016 adds tenant-owned request/submission tables with FORCE RLS,
tenant-qualified foreign keys, immutable submissions and deferred constraints
binding Submitted/Completed to the latest committed submission cycle. Forward
seed `access.documents@3` grants own-request discovery to Employee, Manager and
Administrator; it does not grant HR content authority or rewrite foundation seeds.
Persistent local PostgreSQL has 16 migrations and nine seed versions applied.

NestJS endpoints separate HR tenant scope and account-derived Own scope. Disabled
types block new requests but do not strand existing ones. Open submissions use
shared private file stage/reserve/publish/finalize handling. Final request state,
Ready version, safe audit, notification intent/inbox outcome and replay receipt
commit together. Requested/replacement events target worker-linked accounts;
submitted events target the requesting account. Workers without accounts produce
Undeliverable intents, never invented delivery or accounts. Due dates are
informational; Completed/Cancelled cannot be reopened.

The lazy Angular feature uses the approved native FCL with scope/filter/list in
begin and an Object Page (Overview/Submissions) in mid. Complex creation is routed;
file submission and accept/replacement/cancel are focused native dialogs. Queries
remain server-owned; Signal Forms preserve failed drafts and stable retry keys,
guard dirty navigation, and clear prior-context data. There is no feature CSS,
new floorplan, fabricated business data or production integration.

## Executed evidence

Eight real PostgreSQL/NestJS cases in
`libs/hcm/api/documents/module/src/lib/document-requests.database.spec.ts` cover:

- Real HR creation, own DTO projection and same-tenant subject isolation.
- Replacement history, exact latest-cycle acceptance and terminal states.
- Two simultaneous submissions, cancel during publish and accept/replacement races.
- Storage retry and transaction rollback when notification persistence fails.
- No-account workers, disabled classifications and strict command/query metadata.
- Runtime RLS, tenant-qualified references, immutable grants and cycle constraints.
- Current permission revocation between file publication and finalization.
- Actor-bound command replay, changed payload rejection and scope-bound cursors.

The broader suite initially found an outdated migration inventory expectation;
its nine-test upgrade suite passes after adding migration 000016 and the three
forward discovery grants. Existing HCM authority, notification and document
regressions pass. The final complete run passes **165 tests across 25 files**
(`.tmp/requests-pg-final.txt`). API and web production builds pass, including a
web rebuild with the final held rollout status. All affected project lint and
strict changed-test/tooling lint pass. Prettier, Git whitespace, architecture,
documentation, 65 page templates and 15 factory tests pass. The admitted design
readiness gate reports 20/20; this checks approved design evidence and does not
supersede the explicit integration release hold below.

Three browser cases pass across `.tmp/requests-browser.txt` and
`.tmp/requests-browser3.txt`: routed HR creation and dirty cancel, employee file
submission/download, HR replacement and latest-version acceptance; all four themes
at 390/768/1440/2560 with zero axe violations and no outer overflow; and persisted
tenant accent application/removal with exact restoration. The first two functional
attempts used dialog-descendant locators that missed UI5's projected light-DOM
controls. The corrected component-host locators pass without changing production
behavior. Screenshots under `.tmp/hcm-document-requests` were visually reviewed.

Local acceptance records remain in PostgreSQL/private storage. Inspection reports
no missing Ready files and no abandoned cleanup candidates. API startup does not
run migration or maintenance work.

## Resolved release hold: notification destination

The [domain policy](../domain/HCM-1-DOCUMENTS.md#contract) sends submitted notices
to the HR requester, but the TDD originally required every notification deep link
to select Own scope, which that recipient cannot read. On 2026-09-26 the product
owner resolved [DEC-DOCUMENT-REQUESTS-004](../apps/document-requests/DECISIONS.md):
requested/replacement notices select Own scope and submitted notices select HR
scope. The [revised TDD discovery rule](../apps/document-requests/TDD.md#discovery),
decision register and blueprint carry refreshed approval hashes. Grants, recipient
rules and destination permission/subject checks are unchanged.

My Notifications now passes the event's scope with the request deep link. The
catalogue entry is `complete`, so the app is Available to HR and employee
discovery; the six production-integration apps remain Planned.

## Release evidence (2026-09-26)

- New live case `opens each notification recipient in the request scope that
authorizes it`: Jim's persisted "Document requested" notice opens Own scope and
  Toby's "Document submitted" notice opens HR scope with HR actions, both through
  the real inbox, API and PostgreSQL. The routed create/submit/replace/accept
  lifecycle also passes (`.tmp/requests-release-browser.txt`).
- PostgreSQL/NestJS suite: **165 tests across 25 files** pass
  (`.tmp/requests-release-pg.txt`). Production `hcm-web` and `hcm-api` builds
  pass. Affected project lint, runtime catalogue check/validation, architecture,
  documentation, 66 page templates and 15 factory tests pass. Single-app and
  admitted readiness report ready (20/20).
- Live browser helpers were stabilized for the shared shell and FCL: application
  search waits for the rendered shellbar instead of toggling an already expanded
  field, and Object Page actions wait for the mid column to stop resizing.

Known shared regression (not app-specific, not fixed here): the two
theme/branding accessibility cases now report axe `color-contrast` for the
inverted positive ObjectStatus mandated by the
[data-presentation skill](../../../.ai/skills/hcm-data-presentation/SKILL.md)
(white on Horizon Light `#30914c`, 3.97:1 at 12px). It applies to every app using
that status and needs a shared UX/theme decision. Opening the native toolbar
overflow while an FCL column resizes can also leave it expanded without a popover;
that is a shared Object Page watch item.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts document-requests.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Browser acceptance requires the request catalogue candidate to be activated and
local API/web on 4402/4302. Final activation follows the decision above. Storage
prerequisites are in [document operations](../engineering/DOCUMENT-STORAGE.md).
On hosts with Nx worker issues set NX_DAEMON=false and NX_ISOLATE_PLUGINS=false.
