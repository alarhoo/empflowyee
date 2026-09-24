# Notification administration validation

Branch: `codex/hcm-1-notification-administration`.

## Behavior and review

Notification Templates reconciles its earlier selection with the mandatory UX
matrix: native FlexibleColumnLayout, a begin-column bounded list/sort page, and a
mid-column approved Object Page with Overview and Plain-text preview. Selection is
deep-linkable by event. A focused title/body/reason dialog edits one exact revision
and previews its draft using explicitly entered sample values. Notification Rules
uses the approved native Dynamic Page for three bounded switches and a focused
reason dialog. Both use Signal Forms, dirty-leave protection, retained failed
choices, safe same-key retries and no feature CSS.

Migration 000011 creates notification-owned templates/rules with FORCE RLS,
composite tenant/account references and column-scoped runtime update privileges.
The explicit versioned configuration seed provisions three safe templates and
three enabled event switches without inbox/audit history. Reapplying seeds does
not overwrite administrator edits. Runtime cannot create new event types or
remove configuration. These scripts were applied to persistent local hcm_db.

Strict shared contracts enforce title/body bounds, plain text, registered
placeholders, no HTML/control characters/external links, positive revisions and
required reasons. Writes reauthorize permission, account and entitlement and
commit update/audit/receipt together. Audit stores field names and reason; no
message text is included. Its target types remain notification-owned.

The internal RecordDocumentNotification application port is now implemented with
an adapter bound to the authorized, serialized document command transaction. It
resolves requested/replacement to worker-person accounts and submitted to the
requester account only, snapshots template/rule/preference choices and records
Delivered, Suppressed or Undeliverable intents. Committed event retries retain the
original recipient set and message text. No public send endpoint, worker identity,
queue, email or webhook is introduced. Actual document producers are the next
slice; local inboxes remain honestly empty until then.

Migration 000012 corrects rendered-text storage bounds without changing the
120/1000-character template authoring limits. Literal request IDs can expand
placeholders, and a null due date can render empty text. Finite 24000/200000
character storage bounds cover the input maximum; evidence is never truncated.

## Verification

The complete PostgreSQL suite passes 124 tests across nineteen files. Eight
administration/delivery cases cover bounded configuration, safe text rejection,
revisions/replay/concurrency, current authority, immutable prior inbox content,
audit rollback, actual foreign records/RLS/privileges, exact event recipients,
disabled rules/preferences/accounts, missing recipients, occurrence replay,
producer rollback and maximum literal expansion. Existing inbox and foundation
regressions continue to pass. Exact migration/seed/table inventory assertions were
extended without weakening prior checks.

Four live browser cases pass: actual template edit/preview/save and offline retry
with original text restored; actual rule toggle and employee denial with prior
state restored; list/detail/rule pages in all four Horizon/HER variants at
390/768/1440/2560 widths (48 views), zero axe violations and no outer overflow;
and tenant accent application/removal with exact restoration in finally.
Captures under `.tmp/hcm-notification-administration` were visually reviewed.

Web/API production builds, affected lint, formatting, architecture, documentation,
54 native page-template checks and all 20 admitted design readiness checks pass.
Existing SQL-column camelcase lint warnings are unchanged. No remaining document
or deferred production-integration app is marked implemented by these checks.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts notification-administration.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Run the local HCM API and web server on ports 4402 and 4302 before browser tests.
Use `NX_DAEMON=false` and `NX_ISOLATE_PLUGINS=false` on hosts affected by Nx worker
startup issues. Applied seed/migration files remain immutable.
