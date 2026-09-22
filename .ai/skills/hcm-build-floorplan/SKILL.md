# HCM production floorplan procedure

Use when changing a reusable HCM floorplan.

1. Read the platform catalog, product TDD, installed capability matrix and current validation record.
2. Identify the approved production implementation; a catalog ID alone is not approval.
3. Inspect installed UI5 wrappers, Fundamental Platform and Core declarations. Absence of a component name is not a demonstrated gap.
4. Select native, maintained Angular integration, supported composition, then custom only for a documented unmet capability. Thin empFLOWyee naming wrappers are allowed when native behavior, slots and accessibility remain intact. For the current pilots, reuse Object Page and ToolPageLayout under `libs/hcm/web/ux/floorplans`; Theme Lab supplies feature fixtures, not another floorplan implementation.
5. Keep the floorplan domain-neutral and free of requests/authorization decisions. Preserve Nx tags and boundaries.
6. Make application and Storybook import the same production implementation. Fictional data belongs to shared example hosts, not a second story-only layout.
7. Prove relevant native interactions, four themes, brand cleanup, responsive behavior and accessibility. Counts and compilation alone do not establish approval.
8. Update architecture, API and validation documentation together.

Current pilots are Object Page and ToolPageLayout. Other candidates remain deferred. Follow `docs/hcm/ux/page-layout.md`: page-backed content, mandatory headers, optional native footers and the shared centered canvas. Run `pnpm ux:check-pages`; preserve strict Angular imports and format templates with repository Prettier. If capabilities contradict the TDD, document the discrepancy before implementing a custom substitute.
