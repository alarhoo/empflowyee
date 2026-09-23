# HCM database foundation operations

The [HCM0-02 design](../tdd/TDD-HCM-0-DATABASE.md) implements the
[SQL-first strategy](../architecture/DATABASE-STRATEGY.md). It supplies explicit
SQL migrations and a tenant-scoped query adapter. It creates no business tables
or seeded tenant records. Local shell sessions still work without PostgreSQL.

## Prerequisites and isolated verification

Use the repository's Node 24.21.0 and pnpm 12.5.1, install with
`pnpm install --frozen-lockfile`, and start Docker with Linux containers enabled.
Then run from the repository root:

```sh
pnpm hcm:db:test
```

The suite starts an official PostgreSQL 17 Alpine image pinned by digest in
`tools/hcm-database/test-postgres.mts`, publishes an ephemeral port on loopback,
generates random credentials, runs the real administrator provisioning script,
then tests migrations and RLS. It removes only its own uniquely named container
on completion or setup failure. It never connects to an existing developer or
production database. An interrupted process may leave a container named
`hcm-database-test-<uuid>`; inspect its identity before removing that container.
There is no database skip mode or in-memory substitute. The suite also runs the
existing tenant/session HTTP regressions.

## Provision a dedicated local database

On a new, dedicated PostgreSQL instance, have an administrator set
`HCM_MIGRATOR_PASSWORD` and `HCM_RUNTIME_PASSWORD` in their process environment
using secure, distinct values. Configure psql's normal connection settings for
the administrator, then run:

```sh
psql --dbname=postgres --file=tools/hcm-database/bootstrap.sql
```

The script creates `hcm_migrator`, `hcm_runtime` and `hcm_db`, revokes public
database/public-schema privileges and grants only runtime connection access.
It deliberately fails on existing roles/databases rather than altering an
unknown installation. If provisioning fails midway, inspect what was created
and resolve the failure explicitly; do not delete an existing database to retry.
This script is local infrastructure provisioning, not the HCM0-03 seed framework.
Production Cloud SQL/IAM provisioning needs its own reviewed infrastructure design.

## Apply SQL explicitly

Set `HCM_MIGRATION_DATABASE_URL` in the command's server environment to a PostgreSQL
connection URI using `hcm_migrator` and database `hcm_db`. Escape credentials in the
URI and configure certificate verification for remote connections. Keep the URI
out of source control, browser configuration and terminal logs. Then run:

```sh
pnpm hcm:db:migrate
```

Expected first result: `HCM migrations complete: 1 applied.` A repeated run reports
`0 applied.` The command validates database/role identity, locks migration execution,
checks the entire applied history and commits each new migration together with its
checksum record. Connection acquisition is bounded to 10 seconds, lock waiting to
15 seconds and migration statements to 60 seconds. Failure exits nonzero and
suppresses provider diagnostics. Use restricted administrator inspection of
`hcm.schema_migrations` and reviewed SQL files to diagnose it; never publish SQL
error payloads containing business data or credentials.

The runtime receives a separate URI through an owning server module when its
first persistent domain is implemented. That module constructs
`HcmTenantDatabase<DomainDatabaseMapping>` and owns its shutdown. Never use the
migrator URI for API queries. Neither role provisioning nor migration runs during
normal API startup. There is no production migration/deployment job in this milestone.

## Authoring, recovery and compatibility

Add the next contiguous `NNNNNN_domain_description.sql` under
`libs/hcm/api/database/migrations/sql`. Name the owning domain in its SQL comment.
This is the one ordered inventory, not a schema-per-domain hierarchy. Files are
UTF-8 without BOM, with CRLF normalized to LF for checksums. SQL is authoritative;
Kysely types are maintained server-side alongside future domain repositories and
never exposed as DTOs. Do not add Kysely schema builders or another migration engine.

Files run inside a PostgreSQL anonymous block within an explicit transaction.
Write transactional SQL statements; use `PERFORM` for result-discarding expressions.
Transaction control, psql meta-commands, `CREATE DATABASE`, concurrent indexes and
other nontransactional operations are unsupported. Future exceptions require a
reviewed operational design, not disabling the runner's transaction protection.

Failed SQL rolls back its DDL and history entry; previously committed migrations
remain applied. Correct an unmerged/unapplied draft and retry. Once merged/applied,
SQL is immutable. Restore the failed migration's environmental prerequisites or
ship a reviewed forward repair; never edit history/checksums to conceal a mismatch.
Deploy compatible expansion first, migrate data explicitly, then contract schema
only after old application versions are retired. There are no automatic down
migrations. Production backup/restore and rollout approval remain separate duties.

Every future tenant-owned table needs explicit tenant ownership, ENABLE and FORCE
ROW LEVEL SECURITY, USING and WITH CHECK policies, and minimal grants to runtime.
`hcm.current_tenant_id()` returns null for missing context. The query adapter installs
transaction-local context only from the existing authenticated server scope, and
rejects copied/expired scopes and unsafe database roles. API permission checks
remain mandatory. Application code is trusted; RLS is defense in depth, not a sandbox
for arbitrary SQL supplied by a caller.
