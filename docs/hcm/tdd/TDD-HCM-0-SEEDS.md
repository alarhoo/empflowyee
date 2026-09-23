# HCM0-03 — versioned development seeds

Status: implemented, with [PostgreSQL evidence](../testing/HCM-0-SEED-VALIDATION.md). Scope is the framework in the
[HCM-0 work breakdown](../roadmap/HCM-0-WORK-BREAKDOWN.md), following the
[database strategy](../architecture/DATABASE-STRATEGY.md) and
[real-data policy](../engineering/REAL-DATA-POLICY.md).

## Ownership and initial dataset

Generate one Nx JS library, `hcm-api-database-seed`, under
`libs/hcm/api/database/seed`, tagged `product:hcm`, `runtime:api`,
`domain:database`, `type:infrastructure`. It consumes Node and pg; the composition
CLI supplies the canonical inventory through the existing migration loader. No browser, public DTO, API startup or business
feature imports seed tooling. The CLI is an explicit operator command.

The canonical manifest uses format version 1 and dataset `dunder-mifflin`. Its
initial framework checkpoint had an empty modules array. The approved
[persistent runtime design](TDD-HCM-PERSISTENT-RUNTIME.md) now supplies four
domain-owned modules for the minimal platform spine. Further modules arrive only
with their owning approved domain schema and FDD/TDD, with ownership declared in
the manifest and SQL. Seed data remains separate from runtime implementation.

## Manifest and IDs

Each immutable module version declares `id`, `domain`, positive integer `version`,
`dependsOn` (exact `id@version` references), `requiresMigrations` (exact SQL filenames),
and `apply`/`reset` SQL filenames. Versions are contiguous from 1 per module;
later versions implicitly depend on their predecessor. Explicit dependencies
must exist and be acyclic. Deterministic topological traversal sorts root module
keys and each prerequisite list. Unknown fields, duplicate keys/dependencies, invalid paths,
symlinks and malformed UTF-8 fail before connecting.

Stable seed identifiers are opaque text `dunder-mifflin/domain/entity/key` with
strict lowercase slug components. SQL can use `{{id:domain:entity:key}}` outside
quotes, expanded to a quoted stable identifier by the loader. This does not decide
future domain primary-key types; domains needing UUID/numeric IDs must explicitly
design a compatible mapping. Never derive identity from insertion order, random
values or display names. Format 1's ID and expansion rules are immutable.

SHA-256 covers the canonical descriptor plus normalized apply/reset SQL and format
version. JSON field order and dependency-array order do not affect checksums;
CRLF is normalized to LF. Applied content cannot be edited or removed from the
manifest. New data corrections use a new module version.

## Environment and database safeguards

The command requires `APP_ENVIRONMENT=local`, `NODE_ENV=development` or `test`,
`HCM_SEED_TARGET=local-dunder-mifflin`, and a separate `HCM_SEED_DATABASE_URL`.
Reject cloud runtime markers, all unknown environments/targets, nonliteral
loopback addresses, non-PostgreSQL URLs, URI query overrides, fragments, wrong
database and wrong username before connecting. Never fall back to pg environment
defaults. The connection must authenticate directly as restricted `hcm_migrator`
in `hcm_db`, without elevated attributes or role memberships.

Also require database comment `empflowyee:local-development:dunder-mifflin`, set
only by explicit local administrator provisioning. The production migration
inventory never installs this marker. Existing local instances can be deliberately
marked through the documented administrator procedure. This is protection against
operator mistakes, not an authentication boundary or proof against an administrator
deliberately relabeling/tunneling a production database. Production seeding is unsupported.

## Transactions, history and reset

Add one SQL migration creating `hcm.development_seed_history`, owned by migrator
with no PUBLIC/runtime access. It records dataset, module ID/version, checksum and
application time; it contains no employee/tenant records. The seed runner never
creates schema or runs migrations implicitly.

Use the same advisory lock as the migration runner to serialize migration, seed
and reset operations. Validate the entire applied migration inventory and every
declared prerequisite before writing. Check every applied seed against the current
manifest and require its dependencies to be recorded. Per-module apply SQL and
ledger insertion commit atomically. Failures preserve earlier successful modules
and roll back the failed module, so retry skips completed work. SQL runs inside an
anonymous block in an explicit transaction, preventing transaction escape.

Reset requires `--reset --confirm=local-dunder-mifflin`, all ordinary safeguards,
an exact manifest/history match and all migration prerequisites. Execute reset SQL
for applied modules in reverse dependency order, and remove their ledger rows in
one transaction. A reset failure rolls back the entire reset. There is no generic
TRUNCATE, schema drop, CASCADE or database deletion. Each future domain must supply
reviewed reset SQL targeting only its known development records. Reapply recreates
the same IDs; reset is an explicit data mutation, never an automatic recovery step.
Domain migrations must explicitly authorize seed writes under their approved RLS
model. The framework never disables RLS or grants BYPASSRLS; table ownership alone
does not permit writes through FORCE ROW LEVEL SECURITY.

Connection, lock and statement timeouts follow HCM0-02. Always close connections;
safe CLI failures contain no SQL/provider diagnostics or credentials.

## Acceptance evidence

Use the existing disposable PostgreSQL harness, production migration runner and
local provisioning script. Verify empty manifest, stable IDs, repeatability,
dependency/version order, checksums, missing migrations, concurrent runners,
partial failure/retry, transaction escape rejection, reset order/atomic failure,
runtime ledger denial and environment/database-marker safeguards. Domain-like
probe tables are disposable test fixtures only. Check Nx boundaries, lint, types,
formatting, documentation, architecture and the production API build.
