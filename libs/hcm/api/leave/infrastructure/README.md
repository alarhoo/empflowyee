# hcm-api-leave-infrastructure

Leave-owned SQL adapters on existing authorized tenant transactions. Policy drafts
use typed rule tables from migration 59, forced RLS, composite foreign keys and
parent locks. DTO projections preserve exact decimal strings. This library does
not independently authorize requests, commit transactions or publish policies.

Run the focused disposable PostgreSQL suite from the repository root with Docker
available:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/leave/infrastructure/src/lib/policy.database.spec.ts
```

See the [policy design](../../../../../docs/hcm/apps/leave-policies/TDD.md) and
[delivery evidence](../../../../../docs/hcm/testing/HCM-3-LEAVE-FOUNDATION.md).
