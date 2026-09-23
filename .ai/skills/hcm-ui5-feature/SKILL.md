# HCM UI5 business feature

## Non-negotiable
The feature is theme-agnostic. It does not "use HER" by adding CSS. The HCM shell applies the active theme globally.

## Procedure
1. Read approved FDD/TDD and floorplan selection.
2. Consume the explicit contract through the domain data-access library.
3. Use approved floorplan and maintained UI5/Fundamental controls.
4. Bind real API data and real loading/error/empty states.
5. Do not create fake UI5 controls or business fixture arrays.
6. Do not add raw brand colors, HER/Horizon imports, theme classes or deep Shadow DOM CSS.
7. A genuine UX capability gap requires TDD approval and belongs in shared UX/floorplan code, not hidden in the feature.
