# HCM code review

Review only the scope changed by the task unless a broader audit is explicitly requested.

Verify:

1. Nx product/runtime/domain/type boundaries.
2. Runtime-universal contracts remain separate from persistence rows.
3. SQL/RLS tenant isolation and negative cross-tenant evidence for tenant-owned data.
4. Kysely query safety and transaction-scoped tenant context.
5. NestJS authorization is authoritative; navigation/route visibility is not authorization.
6. Real-data policy: production features use NestJS APIs and PostgreSQL, not frontend business fixtures.
7. TDD-selected floorplan/control usage.
8. Semantic presentation follows `../hcm-data-presentation/SKILL.md`.
9. Rich list/detail screens use the approved FCL/detail pattern where the TDD requires it; dialogs are not detail pages.
10. Business UI remains theme-agnostic and does not add arbitrary visual CSS.
11. Focused tests, docs, catalogue status, and traceability are synchronized for the changed app/domain.

Reject architecture shortcuts. Do not turn a normal app review into a full-wave refactor or freeze exercise unless explicitly requested.
