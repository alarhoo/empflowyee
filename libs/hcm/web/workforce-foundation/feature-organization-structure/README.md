# HCM Organization Structure feature

Lazy feature for `/workforce-foundation/organization-structure` (app `ORGANIZATION_STRUCTURE`).
It maintains the organisation HR defaults, legal entities, unit types, effective-dated units,
departments, designations and locations through the real workforce-foundation API.

- Floorplan `UX-FP-FCL` NATIVE: area list, area table or unit tree, and item Object Page.
- Units, legal entities and locations are created and edited on dedicated routes; unit types,
  departments, designations, the organisation profile and retire/reactivate use Dialogs.
- Theme-agnostic: no feature CSS, theme imports or fixture data.

See the [FDD](../../../../../docs/hcm/apps/organization-structure/FDD.md) and
[TDD](../../../../../docs/hcm/apps/organization-structure/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/organization-structure.spec.ts`.
