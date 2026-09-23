# hcm-web-runtime-context

Owns the explicit remote tenant/session bootstrap, validated read-only signal context, resolved presentation preferences, capability facade and catalog-driven route guard. Production code has no fixture principal or role/entitlement mutation API.

Import through `@empflowyee/hcm-web-runtime-context`. See the [HCM maintainer guide](../../../../../docs/hcm/architecture/shell/README.md) for architecture, constraints and workflows.

```sh
pnpm nx lint hcm-web-runtime-context
pnpm nx test hcm-web-runtime-context
```
