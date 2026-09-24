# Skill — HCM floorplan selection

Use during FDD/TDD creation for an HCM screen.

1. Identify the user goal, information density, navigation relationship, edit model, and device expectations.
   Apply the mandatory UX decision matrix in [HCM UI5 implementation](../hcm-ui5-feature/SKILL.md): meaningful list-detail uses native FCL and page-backed Object Page/detail; only small focused flows use dialogs; complex creates/edits and wizard processes use dedicated routes. Record the classification and column/page ownership in the TDD.
2. Consult the approved HCM floorplan catalog/capability matrix.
3. Prefer a maintained UI5/Fundamental primitive or existing empFLOWyee floorplan implementation.
4. Record the selected floorplan ID in the TDD.
5. Do not create a new floorplan because a feature needs minor styling differences.
6. A feature may compose domain UI inside a floorplan; the floorplan must not know the business domain.
7. Define loading, empty, error, read-only, permission-denied, and responsive states in the TDD.
