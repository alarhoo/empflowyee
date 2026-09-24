# Document Requests implementation validation

Branch: `codex/hcm-1-document-requests`.

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

## Release hold: notification destination

Nineteen other local-stage apps are complete. This last app's core runtime and UI
are implemented, but catalogue release remains held pending one documented
navigation decision. The six production-integration apps remain Planned.

The [domain policy](../domain/HCM-1-DOCUMENTS.md#contract) sends submitted notices
to the HR requester. The [approved TDD discovery rule](../apps/document-requests/TDD.md#discovery)
says every notification deep link selects Own scope. The HR requester cannot read
another employee's request through the self endpoint. Neither grants nor recipient
rules should be broadened to make this link work.

Proposed correction: requested/replacement notifications select Own scope;
submitted notifications select HR scope. Every destination still performs its
existing permission/subject checks. The alternative is to retain all-Own links
and require HR to switch scope manually. No new decision approval is claimed;
notification navigation and final catalogue activation await the owner's answer.
The temporary catalogue activation used for browser acceptance is not a release
approval. Existing approved document hashes remain unchanged.

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
