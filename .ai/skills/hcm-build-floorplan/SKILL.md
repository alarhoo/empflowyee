# HCM production floorplan procedure

Use when changing a reusable HCM floorplan.

1. Read the platform catalog, product TDD, installed capability matrix and current validation record.
2. Identify the approved production implementation; a catalog ID alone is not approval.
3. Inspect installed UI5 wrappers, Fundamental Platform and Core declarations. Absence of a component name is not a demonstrated gap.
4. Select native, maintained Angular integration, supported composition, then custom only for a documented unmet capability. Do not create API-normalizing wrappers.
5. Keep the floorplan domain-neutral and free of requests/authorization decisions. Preserve Nx tags and boundaries.
6. Make application and Storybook import the same production implementation. Fictional data belongs to shared example hosts, not a second story-only layout.
7. Prove relevant native interactions, four themes, brand cleanup, responsive behavior and accessibility. Counts and compilation alone do not establish approval.
8. Update architecture, API and validation documentation together.

Current scope is Dynamic Page and Object Page only. Other candidates remain deferred. If capabilities contradict the TDD, document the discrepancy before implementing a custom substitute.
