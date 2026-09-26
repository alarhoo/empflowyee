# Skill — HCM floorplan selection

Use during HCM FDD/TDD creation.

1. Identify the user goal, information density, navigation relationship, edit model, deep-link needs, and expected devices.
2. Apply this decision model:
   - collection/list only -> approved list/report/table floorplan;
   - list + rich selected-object detail -> FlexibleColumnLayout with page-backed Object Page/detail;
   - single rich object lifecycle -> Object Page/detail page;
   - small focused create/edit/action -> Dialog;
   - complex create/edit with many fields/sections/collections -> dedicated routed page;
   - staged process -> approved Wizard on a dedicated route;
   - analytics -> approved analytical floorplan chosen by the TDD.
3. Consult the approved HCM floorplan catalogue/capability matrix and current production implementations.
4. Prefer maintained UI5/Fundamental primitives or existing empFLOWyee floorplans. Do not create a new floorplan for minor styling differences.
5. Record the selected floorplan ID/mode and route/column ownership in the TDD.
6. Keep business-domain ownership independent of screen composition; contextual sections consume the owning domain contracts/services instead of duplicating writers.
7. Define loading, empty, error, read-only, permission-denied, and responsive states that are actually relevant to the app.
8. Business-feature implementation is theme-agnostic. Floorplan selection never introduces feature-specific theme/CSS work.
