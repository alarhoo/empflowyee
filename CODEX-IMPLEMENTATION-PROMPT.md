Read `AGENTS.md`, all relevant `docs/platform` architecture, and the files added by this HCM Shell + Theme Lab milestone. Do not start editing immediately.

Goal: materialize the approved HCM Shell + Theme Lab milestone in the existing Nx workspace.

Required sequence:

1. Inspect the actual `hcm-web` project, Angular version, installed Fundamental NGX/UI5 packages, tsconfig/import conventions, existing Nx tags, and root module-boundary rules.
2. Read `docs/hcm/tdd/TDD-HCM-SHELL-THEME-LAB.md` and `docs/hcm/architecture/shell/*`.
3. Compare the intended Nx commands in `tools/milestones/hcm-shell-theme-lab/NX-COMMANDS.md` with the installed Nx generator options. Adjust only if the current workspace requires it, and document any adjustment.
4. Generate the five Nx libraries using official Nx generators. Do not handcraft Nx metadata if the generator can do it.
5. Copy/adapt the source templates from `templates/hcm-shell-theme-lab/` into the corresponding generated libraries.
6. Preserve the supplied HER SCSS values exactly unless compilation requires a purely syntactic change; if so, stop and report it first.
7. Integrate UI5 initialization, global theme styles, HCM shell routing, and lazy-loaded Theme Lab into `hcm-web`. Keep the app project as a thin composition root.
8. Use Fundamental NGX UI5 Web Component secondary entry points, never the barrel import.
9. Do not create a custom UI5 control skin. HER must keep native Horizon controls and use semantic empFLOWyee tokens plus the approved narrow accent bridge.
10. Do not implement real authentication or call a backend. Use the fixture runtime context only for this milestone.
11. Do not make UI catalog visibility a security boundary. Preserve explicit comments/documentation that backend authorization is authoritative.
12. Run lint/tests/build for the affected graph. Fix only issues caused by this milestone.
13. Update the TDD/implementation notes with the actual generated project names, import paths, and any deviations.

Acceptance criteria:

- `hcm-web` starts successfully.
- `/ux/theme-lab` is lazy loaded.
- switching Horizon Light/Dark and HER Light/Dark changes both UI5 base theme and empFLOWyee surfaces.
- tenant primary-color override is optional, validated, and can be cleared.
- tenant primary color affects governed accent tokens; it does not allow arbitrary CSS injection.
- the mock session controls visible Spaces through roles/entitlements.
- the shell shows only catalog entries visible to the mock principal.
- Theme Lab displays Overview, Object Page, Flexible Columns, and Table/Form dummy previews.
- project graph respects product/runtime/type boundaries.
- no feature library imports `hcm-web-shell`.
- architecture documentation is updated to match reality.

Before implementation, summarize the planned file/project changes and identify any mismatch with the current workspace. Then proceed unless there is a genuine architecture/security ambiguity.
