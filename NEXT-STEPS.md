# Next HCM milestones

The approved correction first proves two production floorplans: Dynamic Page and Object Page. Theme Lab and Storybook must share implementations, theme isolation must be verified, and the [validation record](docs/hcm/ux/floorplans/validation.md) must state the evidence and limits.

Do not expand the floorplan catalog until these implementations meet the [quality standard](docs/hcm/ux/storybook.md#admission-and-quality). Other generated patterns are deferred, not approved merely because their files exist.

After this correction, the next design concerns the production shell runtime contract: tenant resolution, authenticated principal/session, entitlements, branding/preferences, catalog filtering and guards, and shell recovery states. Those changes need their own FDD/TDD and trust-boundary review.

The first real business feature remains a separate decision. Employee Profile is a candidate because it exercises object sections, display/edit forms and authorization. The current profile is a fictional developer example with no persisted business behavior.

## Current acceptance gate

Resolve the Object Page native accessibility findings recorded in [validation](docs/hcm/ux/floorplans/validation.md#object-page-accessibility-gate) before approving it or expanding the catalog. The implementation is inspectable under Storybook Review; Dynamic Page is the canonical native proof.
