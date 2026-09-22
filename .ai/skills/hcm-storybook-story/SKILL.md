# HCM canonical Storybook procedure

Use when adding or changing HCM visual documentation.

- Follow the taxonomy and admission standard in `docs/hcm/ux/storybook.md`.
- Render the production component or shared production example consumed by the application. No story-only layout implementation.
- Supply deterministic fictional inputs and service substitutes; do not call product APIs or mock UI5 internals.
- Use the production theme service, providers, fonts and local assets. Default is Horizon Light with no tenant override.
- Verify cross-family theme and branding transitions without reload, supported densities and responsive sizes.
- Test meaningful consumer interactions, native integration and accessibility. Avoid checklist-only stories.
- Keep the reviewed Dynamic Page and Object Page implementation scope visible under Floorplans / Native and Floorplans / Composed. Display unresolved acceptance findings in the story; do not hide a requested production proof behind an environment flag. Other deferred candidates require reviewed capability evidence before discovery.
