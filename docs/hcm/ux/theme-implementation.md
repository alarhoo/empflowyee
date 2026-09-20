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

Prefer documented SAP/UI5 theme variables and a coherent custom theme bundle over deep Shadow DOM styling or per-control hacks.
