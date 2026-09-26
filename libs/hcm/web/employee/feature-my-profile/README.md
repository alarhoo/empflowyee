# HCM My Profile feature

Lazy feature for `/employee/my-profile` (app `MY_PROFILE`). Every persona with a linked worker
reads their own profile through the Self allowlist and maintains the facts the policy lets them
edit directly.

- Floorplan `UX-FP-OBJECT-PAGE` COMPOSED: a singleton Object Page titled with the display name and
  sections Overview, Personal, Contact, Addresses, Emergency contacts and family, Employment,
  Additional information and Privacy. Each editable item opens a focused native Dialog.
- Personal email and mobile numbers are `mailto:`/`tel:` Links with a _Not verified_ status; family
  and emergency contacts are a bounded client table (20) with Edit and Remove row actions.
- Request correction is hidden until My HR Requests ships (DEC-HCM2-004). The server resolves the
  worker from the verified account on every request; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/my-profile/FDD.md) and
[TDD](../../../../../docs/hcm/apps/my-profile/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/my-profile.spec.ts`.
