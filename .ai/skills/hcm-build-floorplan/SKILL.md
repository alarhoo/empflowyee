# HCM production floorplan procedure

Use when creating or changing a reusable HCM floorplan, or when a feature TDD needs a floorplan decision.

1. Read the FDD/TDD and `../hcm-floorplan-selection/SKILL.md`.
2. Prefer a maintained native UI5/Fundamental implementation, then a supported composition, then custom only for a documented capability gap.
3. Keep reusable floorplans domain-neutral and free of HTTP, authorization decisions, and business-domain ownership.
4. FlexibleColumnLayout is a layout container. Every content column must be page-backed and own its appropriate header/actions.
5. Rich list -> detail flows use FCL when preserving master context materially helps the user. The detail is an approved Object Page/detail page, not a dialog.
6. Small focused create/edit/action flows may use a Dialog. Complex create/edit flows with sections, many fields, collections, long-lived state, or deep-link needs use a dedicated route/page. Multi-step processes use the approved wizard pattern.
7. Do not invent custom CSS/layout engines to imitate maintained controls. Feature-specific visual differences are not a reason to create a floorplan.
8. Validate the interactions/states required by the feature and run focused accessibility/responsive checks plus affected lint/test/build.
9. Storybook/Theme Lab work is optional and out of the normal business-feature critical path unless explicitly requested.
10. Update the authoritative floorplan/TDD documentation when the reusable production contract changes.
