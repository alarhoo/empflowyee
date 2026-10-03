# hcm-api-leave-domain

Pure Leave arithmetic retains rational inputs and integer millionths. It applies
the explicit policy rounding rule once per row, sums exact quantities and preserves
shortfalls for command validation. It does not create implicit entitlement.

Run focused tests from the repository root:

```sh
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts libs/hcm/api/leave/domain
```

See the [owning design](../../../../../docs/hcm/domains/leave/TECHNICAL-DESIGN.md).
