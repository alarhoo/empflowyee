# HCM-3 Workforce impact subject validation

Executed locally on 2026-09-28. Eight disposable PostgreSQL tests passed: four
existing time-context regressions plus four dated impact paging scenarios. The
new tests traverse all pages and compare the exact identity set/order with SQL;
cover all seven target kinds, multiple matching assignments, inclusive assignment
and employment boundaries, ended employment history, incomplete/no-assignment
candidates, malformed inputs, foreign/missing tenant context and pool rejection.

The initial parallel run timed out during setup before assertions. An isolated
run exposed a test fixture attempting an INSERT-only end-date column; the fixture
now uses the existing allowed insert-then-update sequence. The subsequent isolated
run passed all eight tests. Production grants were not expanded.

Affected ESLint and the Workforce module TypeScript check passed without warnings;
the latter includes its SQL tests. API build, architecture and documentation checks
passed. No migration is needed: this is a read-only owner port on existing RLS
storage. Admitted readiness remains 61 ready with zero blocked; no additional
business app is marked Complete and no developer database was migrated/reset.

The [reviewed contract](HCM-3-TIME-SUBJECTS-REVIEW.md) leaves authorization, stable
transaction/lock ownership and pre-publication membership revalidation with the
source consumer. The internal keyset is not exposed as an HTTP cursor.
