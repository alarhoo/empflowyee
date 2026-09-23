# hcm-api-database-kysely

Server-only Kysely pool and verified tenant transaction adapter. SQL migrations own
schema; future domain repositories supply their server-only table mappings as the
`HcmTenantDatabase<Database>` type parameter. There are no business mappings yet.

Obtain an authenticated context from the existing request/runtime application,
perform the domain permission check, then call `database.transaction(context, query)`.
Never pass browser tenant identifiers or expose raw database rows as API DTOs.
Bind the adapter as an owning Nest module's singleton provider so its
`onApplicationShutdown` hook drains the pool, or call `destroy()` in standalone
consumers. Retaining a transaction beyond its callback is unsupported.

`pnpm nx test hcm-api-database-kysely` runs real PostgreSQL integration and runtime
regressions. Docker must be running. See the [design](../../../../../docs/hcm/tdd/TDD-HCM-0-DATABASE.md)
and [operator procedure](../../../../../docs/hcm/engineering/DATABASE-OPERATIONS.md).
