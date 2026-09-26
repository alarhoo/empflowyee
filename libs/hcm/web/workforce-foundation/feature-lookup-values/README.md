# HCM Lookup Values feature

Lazy feature for `/workforce-foundation/lookup-values` (app `LOOKUP_VALUES`). It maintains
the tenant-owned workforce lookup sets (worker types, employment end reasons and worker
event types) and shows the product-owned reference lists beside them read-only.

- Floorplan `UX-FP-FCL` NATIVE: the begin column lists the eight sets grouped by
  ownership; the mid column shows one set's values in a server-mode UI5 Table (pages of
  25, growing) with a deep link `/workforce-foundation/lookup-values/:setKey`.
- Create, edit and retire/reactivate use native Dialogs with Signal Forms. Codes are
  immutable; there is no delete. The worker event type approval flag is display-only.
- Data comes from the real workforce-foundation API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/lookup-values/FDD.md) and
[TDD](../../../../../docs/hcm/apps/lookup-values/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/lookup-values.spec.ts`.
