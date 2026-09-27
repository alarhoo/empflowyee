# hcm-web-ux-floorplan-wizard

Production HCM floorplan `UX-FP-WIZARD` (NATIVE): the maintained UI5 Wizard inside the HCM Dynamic
Page on a dedicated route. Import `HcmWizardPage` and `HcmWizardStep` from
`@empflowyee/hcm-web-ux-floorplan-wizard`.

- Each step is an `<ng-template efHcmWizardStep="id" title="…">`; only the current step renders.
- The page renders the native step header and the footer (Previous step, Next step or the finish
  label, and Cancel). Features never hand-build step navigation.
- The feature owns step validity: `(next)` asks to move `{ from, to }`, and the feature validates
  the current step before setting `current` and `reachable`. Moving back and choosing a reachable
  step emit `(stepChange)` without validation; later steps stay disabled.
- `busy` disables every navigation during the final submission.

Run `pnpm nx lint hcm-web-ux-floorplan-wizard` and `pnpm nx test hcm-web-ux-floorplan-wizard`.
Acceptance evidence is in the [floorplan validation record](../../../../../../docs/hcm/ux/floorplans/validation.md).
