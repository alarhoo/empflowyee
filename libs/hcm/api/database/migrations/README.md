# hcm-api-database-migrations

Server-only, explicitly invoked SQL migration runner. The complete ordered SQL
inventory lives in `sql/`; each migration names its owning domain in a comment.
Do not import this library from normal API startup.

`pnpm hcm:db:migrate` (or `pnpm nx migrate hcm-api-database-migrations`) requires
`HCM_MIGRATION_DATABASE_URL` for the restricted migrator role. This command changes
the database: review the SQL and target first. It never provisions roles or seeds.

The integration suite at `pnpm hcm:db:test` covers this runner alongside the query
adapter. See the [design](../../../../../docs/hcm/tdd/TDD-HCM-0-DATABASE.md)
and [operator procedure](../../../../../docs/hcm/engineering/DATABASE-OPERATIONS.md).
