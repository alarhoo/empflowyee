# Workflow: implement one HCM app

1. Compile the app context/blueprint and read the approved FDD/TDD plus carry-forward notes relevant to this app.
2. Run the executable readiness gate. Stop only for a genuine unresolved blocker.
3. Create/use a granular `feat/hcm-<app-slug>` branch according to the Git workflow.
4. Implement/extend runtime-universal contracts first when the TDD requires contract changes.
5. Apply SQL-first migrations/RLS and Kysely persistence when the app needs new data ownership. Reuse existing domain storage when it already owns the data.
6. Implement NestJS domain/application/infrastructure/transport/module changes with backend authorization.
7. Add focused API/database integration tests, including negative tenant/authorization cases where relevant.
8. Implement Angular data-access against the real API.
9. Implement the lazy feature using the TDD-selected floorplan and `../skills/hcm-data-presentation/SKILL.md` semantics.
10. Keep business UI theme-agnostic. No HER/Horizon imports, raw colors, deep UI5 styling, or arbitrary feature CSS. Dialogs are not rich detail pages.
11. Add focused UI/E2E tests for the business behavior and important interaction states.
12. Synchronize catalogue implementation status, FDD/TDD traceability and app docs for this app only.
13. Run affected architecture/lint/typecheck/test/build checks.
14. Commit coherent slices (docs/contracts, DB/API, UI, tests where sensible). Avoid one giant commit.
15. Review the changed app/domain scope and open the PR. Do not perform a full-wave freeze/review unless explicitly requested.
