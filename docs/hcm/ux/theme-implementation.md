# HCM Theme Implementation Direction

## Supported theme families

Initial built-in choices:

- Horizon Light
- Horizon Dark

empFLOWyee-owned choices:

- HER Light
- HER Dark

Tenant branding adds a controlled primary-color overlay on top of the selected family.

## Tenant branding flow

The [current Shell + Theme Lab implementation](../architecture/shell/README.md) supports
the four choices and a validated accent in fixture memory. The persistence/bootstrap
steps below describe the future production flow; they are not implemented by this milestone.

```text
Tenant selects primary color
 -> validate/normalize
 -> derive semantic palette
 -> contrast checks
 -> map to approved SAP/empFLOWyee variables
 -> persist tenant theme config
 -> apply at HCM bootstrap/session load
```

Do not create one CSS theme file per tenant.

## Custom theme policy

The accepted [HER overlay ADR](../adr/ADR-0002-her-theme-as-horizon-overlay.md) keeps
native Horizon controls and permits only the [documented accent bridge](../architecture/shell/theming.md#implemented-accent-bridge).
A complete custom UI5 theme bundle requires a separate ADR. Deep Shadow DOM styling
and per-control skinning are prohibited.
