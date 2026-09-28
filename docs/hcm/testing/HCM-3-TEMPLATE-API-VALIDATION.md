# HCM-3 template API validation

Verified locally on 2026-09-28. The real Nest Attendance module is composed in
`hcm-api` and exposes the nine admitted template routes: list/detail, create,
whole-draft replacement, successor, preview, publish, copy and retire. Existing
authenticated sessions, current operation grants, tenant scope, exact revisions,
same-origin/media validation and UUID idempotency keys govern all commands.
The existing write-header helper accepts an explicit query allowlist; its default
remains empty for existing controllers. Attendance admits only the version selector
on the four exact-version content mutations.

Migration 41 adds immutable, RLS-protected Attendance query cursors. Responses
contain unpredictable random handles; storage contains only their hashes and
server-owned actor/app/query/grant/source binding. Lists select latest versions
before filtering, use parameterized literal substring filters and deterministic
keyset ordering. Any source mutation invalidates continuation. Expired cache
cleanup deletes at most 100 rows on issuance and needs no UPDATE permission or
API scheduling loop. No totals or private fields are fabricated.

Five PostgreSQL/HTTP tests pass against the restricted runtime role and persisted
development personas. They cover the full lifecycle, exact versus latest versions,
replayed publication, independent copies, retirement, equal sort ties, changed
filters/sort/page size, forged/expired handles, actor changes, grant revocation,
source changes and expired-cache cleanup. A real second tenant's template remains
hidden from list/detail/preview. SQL proves negative cross-tenant reads/inserts,
composite foreign references and denied cursor UPDATE. Origin, media, malformed
key, duplicate/unknown query, unauthorized actor and safe-error projections are
also checked. Encryption uses a test-only injected local cipher, not a fake port.

The focused pure suite passes 37 tests. Targeted ESLint and the Attendance module
TypeScript check pass. A fresh `hcm-api` webpack build passes with the new module.
Architecture/documentation checks pass. HCM-3 query design review passed 23/23
before dependent implementation. Final readiness passes all 61 admitted apps,
including the 23 HCM-3 apps. The ten existing PostgreSQL command/publication
regression cases also pass with the query adapters composed.

Canonical Attendance seed grants/default drafts and the native UI are still
pending. Test setup explicitly grants the exercised template operations; these
test grants are not claimed as a delivered development seed. All apps remain
Planned until their full acceptance is verified. Migration/seed orchestration
stays explicit and never runs during API startup.

Subsequent [seed validation](HCM-3-SEED-DEFAULTS-VALIDATION.md) delivers canonical
template grants and adds the tenth endpoint for incomplete draft defaults. The
pending-seed statement above records this API slice's original boundary.
