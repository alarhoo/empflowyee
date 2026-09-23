# Workflow: implement one HCM app

1. Compile app context/blueprint.
2. Verify v3 FDD/TDD are approved and zero blockers remain.
3. Create `feat/hcm-<app-slug>` branch using git workflow skill.
4. Reuse existing domain contract/API; extend contract/DB/API only if TDD requires it.
5. Ensure API returns real PostgreSQL data.
6. Implement Angular data-access.
7. Implement lazy feature with approved floorplan/UI5 controls.
8. Keep business UI theme-agnostic; custom feature CSS is forbidden by default. Follow `docs/hcm/architecture/UI-BUSINESS-SCREEN-INVARIANTS.md` for approved shared UX exceptions.
9. Add tests and traceability.
10. Run Nx affected lint/typecheck/test/build and architecture checks.
11. Commit coherent slices, review, then PR.
