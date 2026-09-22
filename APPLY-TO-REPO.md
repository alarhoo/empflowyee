# HCM UX foundation maintenance

The initial overlay was materialized, then superseded by the approved production-UX correction. Existing source does not require regeneration.

Start with the [root README](README.md#hcm-ux-workshop), [current scope](CODEX-IMPLEMENTATION-PROMPT.md) and [Storybook guide](docs/hcm/ux/storybook.md).

```bash
node tools/ux/check-component-entrypoints.mjs
node tools/ux/check-storybook-readiness.mjs
node tools/milestones/hcm-ux-floorplans-storybook/verify-bundle.mjs
```

The curated iteration contains Dynamic Page and Object Page. They use native UI5/Fundamental behavior and shared production example hosts. The remaining generated floorplans and form/table adapters are deferred candidates, excluded from canonical Storybook discovery.

Keep Storybook on the existing HCM app, preserve Nx boundaries, and never build an alternative story-only implementation. See [acceptance evidence](docs/hcm/ux/floorplans/validation.md) before approving further patterns.
