# hcm-web-ux-floorplan-object-page

**Acceptance pending:** installed native tab/form markup has unresolved accessibility findings. This production-code proof is available in Theme Lab and Storybook Review, but is not approved for feature adoption.

HCM floorplan with domain-neutral state/action and content-region contracts. Import from `@empflowyee/hcm-web-ux-floorplan-object-page`. Maintained UI5/Fundamental components own layout and interaction; the consuming feature owns data, permissions and business behavior.

See the [API guide](../../../../../../docs/hcm/ux/floorplans/README.md), [capability evidence](../../../../../../docs/hcm/ux/floorplans/component-capability-matrix.md), [Storybook procedure](../../../../../../docs/hcm/ux/storybook.md) and [validation](../../../../../../docs/hcm/ux/floorplans/validation.md).

Run `pnpm nx lint hcm-web-ux-floorplan-object-page` and `pnpm nx test hcm-web-ux-floorplan-object-page` from the repository root. The shared production example lives in the Theme Lab feature library and is consumed unchanged by Storybook.
