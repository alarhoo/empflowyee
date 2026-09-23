# HCM0-02 — SQL-first database foundation

Status: implemented, with [PostgreSQL validation](../testing/HCM-0-DATABASE-VALIDATION.md). Implements the existing [database strategy](../architecture/DATABASE-STRATEGY.md); no business schema, authentication boundary or deployment is introduced.

## Projects and dependencies

Generate `hcm-api-database-migrations` and `hcm-api-database-kysely` with the official Nx JS library generator under `libs/hcm/api/database/{migrations,kysely}`. Both carry `product:hcm`, `runtime:api`, `domain:database`, `type:infrastructure`. The migration library consumes Node and `pg`; the query library consumes `pg`, Kysely and the existing runtime application library. No browser or public DTO depends on either project. The API stays a thin composition root and does not connect to PostgreSQL until a domain requires persistence.

## SQL and operations

One explicit runner owns globally ordered `NNNNNN_description.sql` files under the migration library's `sql` directory. Future domain changes supply SQL through this reviewed sequence, with domain ownership in each file's comment. Six-digit versions must be contiguous from 000001. SHA-256 covers UTF-8 SQL with CRLF normalized to LF. Applied names/checksums must match the complete history prefix; missing, edited or inserted historical files fail before new SQL executes.

A dedicated migrator connection acquires a session advisory lock for the whole run, including history creation and verification. Lock acquisition and SQL execution have bounded timeouts. Each migration and its history insertion commit in one transaction; failures roll back that migration, retain previous commits and close the connection (releasing its lock). The runner executes SQL inside a PostgreSQL anonymous block, so migration SQL cannot end the surrounding transaction. Only transactional DDL is supported; concurrent index creation and other nontransactional operations need a separate reviewed operational design. Applied SQL is immutable. Before merge, an unapplied failing migration can be corrected; after merge, repair through a new forward migration or restore the unchanged failed migration's environmental prerequisites. Never edit history to force success.

Expand/migrate/contract is mandatory for future business changes: add compatible schema, deploy consumers/backfill explicitly, verify, then remove obsolete schema in a later release. Application rollback must remain compatible with the expanded schema. There is no automatic destructive down migration. Backups, production deployment orchestration and restore approval remain operator responsibilities outside this local milestone.

## Roles and foundation objects

Explicit administrative provisioning creates `hcm_db`, a login `hcm_migrator` owning the database/schema/objects, and a separate login `hcm_runtime`. Both are NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS; runtime has no role memberships, schema creation or object ownership. Public database/schema privileges are revoked. Runtime receives CONNECT and USAGE only; future migrations explicitly grant reviewed table operations. No default blanket table grants are installed.

The runner creates protected `hcm.schema_migrations`. The first migration creates only `hcm.current_tenant_id()`, a stable invoker function reading `nullif(current_setting('hcm.tenant_id', true), '')`. Tenant keys remain opaque text, consistent with current server context. Future tenant tables require ENABLE and FORCE ROW LEVEL SECURITY and explicit USING/WITH CHECK policies. The runtime role cannot read or modify migration history.

## Verified transaction context

The existing runtime application's tenant/session validation issues an immutable, process-local authenticated context. Its provenance is checked through a private WeakMap, so a browser payload or structurally forged object cannot become a query scope. The existing public session DTO is unchanged. The request context exposes this authenticated scope for future domain use cases. Expiry is rechecked before and after pool acquisition.

The Kysely adapter accepts only that verified scope, checks the connection's database/role/privilege posture and sets `hcm.tenant_id` with parameterized `set_config(..., true)` inside each transaction before invoking the query callback. Commit and rollback both clear transaction-local state. No unscoped query API or raw pool is exposed. Domain API permission checks remain mandatory; RLS is defense in depth, not a replacement. The adapter supports explicit destruction/Nest shutdown and bounded pool acquisition. Normal API bootstrap never migrates or provisions roles.

## Verification and local workflow

Use a disposable PostgreSQL container with loopback-only ephemeral port and randomly generated test credentials. Tests provision only that owned container, run the real runner, and create tenant tables solely as test fixtures. Cover deterministic ordering, no-op reruns, checksum/history mismatch, concurrent runners, transactional failure and retry, restricted runtime privileges, missing/forged/expired context, cross-tenant SELECT/INSERT/UPDATE/DELETE, pool reuse after commit/rollback and pool shutdown. Tests must fail if PostgreSQL cannot start; no skipped or in-memory substitutes.

Operator commands accept secrets from server environment variables and never print connection strings or database error payloads. The disposable test harness removes its own container in a finally block. Production Cloud SQL resources, migration jobs and seed tooling remain separate milestones.

Implementation follows PostgreSQL's [row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html), and [transaction-local settings](https://www.postgresql.org/docs/17/functions-admin.html), and Kysely's maintained [PostgreSQL dialect](https://kysely-org.github.io/kysely-apidoc/classes/PostgresDialect.html).
