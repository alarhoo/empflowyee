# HCM Identification Types feature

Lazy feature for `/workforce-foundation/identification-types` (app `IDENTIFICATION_TYPES`).
It shows the product-maintained identification-type catalogue read-only; tenants cannot
change it (DEC-HCM2-016), and no person's identification value is ever shown.

- Floorplan `UX-FP-DYNAMIC-PAGE` NATIVE: search, country and status filters in the header
  and a client-mode UI5 Table bounded to 500 rows.
- Data comes from the real workforce-foundation API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/identification-types/FDD.md) and
[TDD](../../../../../docs/hcm/apps/identification-types/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/identification-types.spec.ts`.
