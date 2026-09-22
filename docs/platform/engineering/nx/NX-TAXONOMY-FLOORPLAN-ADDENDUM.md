# Nx taxonomy addendum — `type:floorplan`

`type:floorplan` is an existing first-class web library type. The UX workshop milestone tightens its dependency policy to the following rules.

## Allowed dependency direction

```text
type:feature -> type:floorplan

type:floorplan -> type:ui
                  type:util
                  type:contract
```

`type:floorplan` must not depend on:

- `type:feature`
- `type:data-access`
- `type:app`
- another `type:floorplan`
- backend/API runtime code

HCM floorplan dependencies must also carry `domain:ux`. This keeps business-domain UI and data types out of reusable layouts.

The existing root ESLint/Nx module-boundary configuration enforces these rules; this addendum does not introduce a second rule set.
