# HCM database foundation operations

The [HCM0-02 design](../tdd/TDD-HCM-0-DATABASE.md) implements the
[SQL-first strategy](../architecture/DATABASE-STRATEGY.md). It supplies explicit
SQL migrations and a tenant-scoped query adapter. The approved
[minimal platform spine](../domain/PLATFORM-SPINE.md) adds persisted tenant,
workforce identity, account and discovery-access records. HCM0-03's
[versioned seeds](DEVELOPMENT-SEEDS.md) populate Dunder Mifflin. The local runtime
now requires PostgreSQL and reads these records through Kysely; it has no fixture fallback.

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

For a persistent Docker-managed local instance, run the explicit provisioning command:

```sh
pnpm hcm:db:up
```

It starts `empflowyee-hcm-postgres` on `127.0.0.1:55432`, using the named volume
`empflowyee-hcm-postgres-data`, then explicitly applies current migrations and seeds.
It manages only its own labeled resources. Reruns retain data and report zero changes
when up to date. The container restarts with Docker; ordinary API startup still
never provisions, migrates or seeds.

Random local credentials are stored in `.local/hcm/database.json`, restricted to
the current OS user and excluded from Git and Docker build contexts. Preserve this
file along with the volume; if resources exist but credentials are missing, the
command fails rather than deleting/recreating data. No database reset is implicit.
Five SQL migrations and four seed module versions establish the current foundation.
Start `pnpm dev:hcm-api` afterward; it reads only the runtime credentials from this
private file. Start `pnpm dev:hcm --host=127.0.0.1` and open `http://acme.localhost:4302`.
The API does not use the administrator or migrator credentials.

The following administrator procedure remains available for a separately managed
dedicated local PostgreSQL instance.

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

Expected first result: `HCM migrations complete: 5 applied.` A database already at
the seed-framework checkpoint applies only migrations 000003–000005. A repeated run reports
`0 applied.` The command validates database/role identity, locks migration execution,
checks the entire applied history and commits each new migration together with its
checksum record. Connection acquisition is bounded to 10 seconds, lock waiting to
15 seconds and migration statements to 60 seconds. Failure exits nonzero and
suppresses provider diagnostics. Use restricted administrator inspection of
`hcm.schema_migrations` and reviewed SQL files to diagnose it; never publish SQL
error payloads containing business data or credentials.

The local runtime receives a separate `HCM_DATABASE_URL` using `hcm_runtime` from
the launcher. Runtime infrastructure owns private Kysely bootstrap/session reads
and its Nest shutdown hook. Future domain repositories use
`HcmTenantDatabase<DomainDatabaseMapping>` with authenticated tenant scopes. Never use the
migrator URI for API queries. Neither role provisioning nor migration runs during
normal API startup. There is no production migration/deployment job in this milestone.
See [persistent runtime evidence](../testing/HCM-PERSISTENT-RUNTIME-VALIDATION.md)
for table counts, tenant isolation and end-to-end verification.

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
