# hcm-api-leave-module

Nest composition for Leave-owned policy draft commands and queries. It reuses
Runtime authentication, Access authorization and field encryption. No scheduler
loop or migration runs during API startup.

The real HTTP suite uses disposable PostgreSQL:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/leave/module
```

See the [delivery evidence](../../../../../docs/hcm/testing/HCM-3-LEAVE-FOUNDATION.md).
