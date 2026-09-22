# HCM UX Foundation Lab skill

Use this skill when changing the HCM Theme Lab or using it to validate a new HCM UX primitive.

## Rules
1. Read the FDD/TDD and theme token contract first.
2. Prefer native UI5/Fundamental controls.
3. Never create an HTML/CSS lookalike for an available UI5 control.
4. Use official UI5 docs for capability selection; at implementation time verify the repository package supports the selected import.
5. Keep the lab realistic: controls belong in Employee, Leave, Projects or Settings based on actual HCM use.
6. Keep HER token edits semantic and reversible.
7. Verify all four themes after any UX change.
8. Verify no HER token leakage when Horizon is active.
9. Implement the two authorized reusable pilots under `libs/hcm/web/ux/floorplans`: Object Page (native DynamicPage + TabContainer) and ToolPageLayout (native NavigationLayout). Theme Lab consumes these libraries and supplies fictional data and feature actions; do not embed a separate layout implementation in the lab. Visual approval governs subsequent feature adoption, not library placement. Thin naming wrappers are allowed when native behavior is preserved. Keep theme switching in the avatar menu and compact density as the default.
10. Do not make Storybook the implementation source of truth.
11. Follow `docs/hcm/ux/page-layout.md`: every screen/FCL column uses a page with a header and optional footer. Keep the shared 90rem centered canvas and responsive gutters at the application/Storybook boundary, not inside individual features. Run `pnpm ux:check-pages` and format HTML with repository Prettier settings.

## Definition of done
- acceptance criteria pass
- Nx boundaries pass
- lint/test/build pass
- docs updated when a control/layout decision changes
