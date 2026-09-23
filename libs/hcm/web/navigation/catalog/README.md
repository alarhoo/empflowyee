# hcm-web-navigation-catalog

Owns pure catalog definitions and presentation filtering by permissions, entitlements and feature flags. It receives the universal access contract and does not import the runtime store or feature implementations. Canonical role assignments place Spaces; roles alone never grant access. Planned apps stay discoverable with explicit discovery capabilities, while route activation additionally requires an approved implementation. Search uses the same visible catalogue projection. Metadata comes from the checked generated runtime contract, never a hand-maintained app inventory.

Import through `@empflowyee/hcm-web-navigation-catalog`. See the [HCM maintainer guide](../../../../../docs/hcm/architecture/shell/README.md) for architecture, constraints and workflows.

```sh
pnpm nx lint hcm-web-navigation-catalog
pnpm nx test hcm-web-navigation-catalog
```
