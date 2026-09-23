# Versioned HCM development seeds

HCM0-03 implements the framework described in the
[seed design](../tdd/TDD-HCM-0-SEEDS.md). Dunder Mifflin is the canonical fictional
dataset. The [approved minimal spine](../domain/PLATFORM-SPINE.md) now supplies four
immutable module versions: `runtime.tenant@1`, `workforce.foundation@1`,
`identity.accounts@1` and `access.discovery@1`, applied in that dependency order.
They persist Dunder Mifflin, three organisations, two locations, four people/workers/
employments/assignments/accounts/personas, four roles, 170 catalogue-discovery
permissions, 268 role grants and 26 entitlements. Employment lifecycle and business
permissions remain deferred; no leave, payroll or other business app is implemented.

## Verify the framework

Use Node 24.21.0, pnpm 12.5.1 and Docker with Linux containers running:

```sh
pnpm hcm:db:test
```

This provisions a disposable PostgreSQL instance, verifies migration/query/seed
behavior against real SQL, then removes its own container. Tests use isolated
probe tables that are never part of the canonical migration or seed inventory.
`pnpm nx test hcm-api-database-seed` runs only the seed scenarios. See
[framework checkpoint](../testing/HCM-0-SEED-VALIDATION.md) and current
[runtime evidence](../testing/HCM-PERSISTENT-RUNTIME-VALIDATION.md).

## Explicit local provisioning and apply

Follow [database operations](DATABASE-OPERATIONS.md) to provision `hcm_db` with
separate restricted migrator/runtime roles and apply the canonical SQL inventory.
The normal local setup is `pnpm hcm:db:up`: it explicitly provisions, migrates and
seeds the persistent database without requiring manual credentials or SQL commands.
The separate commands below are for deliberately managed local instances.
The local bootstrap script also sets a database comment marking the approved
local target. Migration `000002_development_seed_history.sql` creates protected
seed bookkeeping; production migrations never set the local-target marker.

For a local database provisioned before HCM0-03, first verify the administrator's
connection points to the intended local instance. Deliberately set its marker:

```sql
COMMENT ON DATABASE hcm_db IS 'empflowyee:local-development:dunder-mifflin';
```

This is an administrator operation, not an application bootstrap step. Never mark
a remote/production database or connect through a production tunnel for local seeding.

Set these server process environment values:

| Variable                | Required value                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `APP_ENVIRONMENT`       | `local`                                                                                                    |
| `NODE_ENV`              | `development` (the test harness uses `test`)                                                               |
| `HCM_SEED_TARGET`       | `local-dunder-mifflin`                                                                                     |
| `HCM_SEED_DATABASE_URL` | PostgreSQL URI with `hcm_migrator`, a password, literal `127.0.0.1` or `::1`, the local port and `/hcm_db` |

Store credentials securely outside source control and browser configuration.
The seed URI is separate from `HCM_MIGRATION_DATABASE_URL`; the seed command never
falls back to a runtime/migrator URI or pg environment defaults. URI query
parameters/fragments, DNS hostnames, unknown targets/environments and cloud runtime
markers are rejected. Then run from the repository root:

```sh
pnpm hcm:db:seed
```

Expected first apply: `Dunder Mifflin seed apply complete: 4 module versions changed.`
An unchanged repeated apply reports `0 module versions changed`.
Ordinary API startup never seeds, resets, provisions or migrates. The shell still
uses its normal runtime contracts, now populated from PostgreSQL. These guards prevent accidental target selection;
they cannot attest that an administrator has not relabeled or tunneled a database.

## Add a domain module only when its schema is approved

`tools/hcm-database/generate-spine-seeds.mjs` owns the initial fictional fixture
definitions and the canonical catalogue-to-discovery-grant projection. Run
`pnpm hcm:db:seed:check` to verify its checked-in SQL. Do not regenerate an applied
version to accommodate later catalogue changes: add a new immutable seed version
and update the generator/check design together. Persona/permission arrays belong
in this explicit seed tool, never in production Angular or runtime adapters.

The manifest is `libs/hcm/api/database/seed/manifest/manifest.json`, format version 1.
Keep SQL beside that manifest; the loader rejects unregistered files, symlinks,
path traversal, unknown fields and malformed UTF-8. Each module declares:

| Field                | Meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| `id`, `domain`       | Stable module identity and owning approved domain           |
| `version`            | Contiguous positive integer starting at 1 for that module   |
| `dependsOn`          | Exact immutable `module-id@version` prerequisites           |
| `requiresMigrations` | Nonempty list of required canonical SQL filenames           |
| `apply`, `reset`     | Unique flat SQL filenames, including their `.sql` extension |

Version 2 implicitly depends on version 1. The runner rejects missing/cyclic
dependencies and orders modules deterministically. SQL history must exactly match
the current canonical migration inventory before any seed writes, including for
an empty manifest. Apply migrations explicitly first; seeding never repairs schema.

Use stable opaque text identifiers from `developmentSeedId(domain, entity, key)`
or the SQL token `{{id:domain:entity:key}}`, placed **outside SQL quotes**. It expands
to a quoted value such as `dunder-mifflin/domain/entity/key`. Components are lowercase
slugs without SQL punctuation. Stable keys are not generated from row order or
display labels. A domain requiring UUID/numeric keys must specify its mapping in
its approved design; this framework does not choose business primary-key types.

SQL files run in anonymous blocks inside transactions. Use transactional SQL and
`PERFORM` for discarded expressions; do not use COMMIT, ROLLBACK, psql commands or
nontransactional DDL. Domain seed SQL supplies data to already approved tables,
never substitutes for schema migrations. Reviewed reset SQL must remove only its
known development records, respecting dependencies and preserving unrelated work.
The runner provides no generic TRUNCATE, CASCADE or schema deletion.

The framework uses the existing restricted migrator for deliberate local data
maintenance. FORCE ROW LEVEL SECURITY still applies to table owners: future domain
migrations must explicitly authorize seed writes according to their approved RLS
model. Do not disable RLS, add BYPASSRLS or weaken runtime policies to make seeds pass.
All feature screens later read seeded data through real Nest APIs and public DTOs.

## Repeatability, failure recovery and reset

SHA-256 covers each descriptor plus apply/reset SQL, normalized to LF. Module
versions and both scripts become immutable when applied. A repeated run skips
matching ledger entries. A mismatch, missing historical definition or missing
historical dependency fails before new writes; fix the checkout or deliver a new
module version, never rewrite history to conceal a mismatch.

Each module and its ledger record commit atomically. If module B fails after A
succeeds, A stays committed; B's data and ledger roll back. Restore B's environmental
prerequisites or correct an unmerged/unapplied draft, then retry. Retry skips A.
Migrations, apply and reset share a PostgreSQL advisory lock. Connections always
close, and connection/lock/statement timeouts are 10/15/60 seconds respectively.
CLI failures exit nonzero without printing SQL, provider errors or credentials.

Reset is a deliberate data mutation requiring an exact target confirmation:

```sh
pnpm hcm:db:seed --reset --confirm=local-dunder-mifflin
```

All ordinary environment, database, migration and history checks still apply.
Reset runs applied modules in reverse dependency order and deletes their ledger
records in **one transaction**. Any failure rolls the whole reset back. Reapplying
the unchanged manifest recreates identical IDs. There is no automatic reset on
failure and no production seed/reset mode.
