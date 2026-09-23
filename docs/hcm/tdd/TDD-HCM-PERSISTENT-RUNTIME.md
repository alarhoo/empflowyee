# Persistent HCM-0 runtime

Status: implemented against the [approved minimal spine](../domain/PLATFORM-SPINE.md).
See [local validation evidence](../testing/HCM-PERSISTENT-RUNTIME-VALIDATION.md).

## Ownership and SQL

Keep the existing SQL-first runner and one `hcm_db` / `hcm` schema. Add ordered
migrations with explicit domain ownership for tenant runtime projections,
workforce-foundation records, and identity-access/access-control records. Use
opaque text keys, tenant-composite primary/foreign keys, unique tenant codes,
NOT NULL fields and constrained lifecycle/configuration values. Tenant-owned
tables ENABLE and FORCE RLS using `hcm.current_tenant_id()` for runtime and deliberate
migrator operations. Runtime receives SELECT only; the migrator uses explicit
transaction-local tenant context for seeds. No BYPASSRLS, owner connection or
RLS-disable switch is used by the API.

`tenant_hostname` and entitlement definitions are explicitly global routing/catalogue
projections. The routing table contains only hostname and internal tenant ID, no
workforce/session data. Existing safe pre-auth discovery requires resolving this
index before tenant RLS can be set. Runtime infrastructure alone reads the exact
Host mapping and installs its resolved ID for pre-auth tenant presentation reads.
This preserves the existing tenant-directory port and its public field allowlist;
business queries still require HCM0-02's authenticated context.

## Runtime composition

Reuse `hcm-api-runtime-{domain,application,infrastructure,module,transport}` and
`hcm-api-database-kysely`; no deployable, Nx type or business feature is added.
Runtime infrastructure owns only the typed bootstrap/session read projections,
not workforce business behavior. Share the restricted-role assertion with the
Kysely foundation. A private Kysely pool owns read transactions and Nest shutdown.

The application passes its server-resolved tenant ID into the internal session
reader request. Browser input cannot override it. The local reader loads the selected
persisted persona, enabled account, person/worker identity, roles, permissions,
enabled entitlements and preferences within that tenant's RLS scope. It returns
the unchanged universal session DTO. Unknown/disabled accounts, absent membership,
non-loopback callers and nonlocal/cloud environments fail closed. There are no
in-memory persona or capability fallback arrays in production code.

The local launcher reads runtime-only credentials from the ignored private local
configuration. It never runs migrations/seeds. Explicit `pnpm hcm:db:up` provisions
the persistent named volume, migrates and seeds. Development runtime remains opt-in;
production adapters stay unconfigured. No new authentication trust mechanism is
introduced; the accepted local-session ADR continues to govern selection and expiry.

## Seeds and verification

Register immutable domain seed versions in dependency order. Persist catalogue
discovery permissions from a checked generated SQL projection of the canonical
catalogue; the runtime does not calculate grants from catalogue arrays. Generation
is explicit and checkable, and applied SQL remains immutable. Dunder Mifflin has
Scranton and New York locations and the four established personas. Test tenants
and hostile inputs live in isolated integration fixtures, not canonical business seeds.

Verify real Nest HTTP calls against disposable PostgreSQL; changing/revoking a DB
grant or disabling an account must change the next session response. Test tenant
RLS, cross-tenant foreign keys, missing context, wrong Host, unknown personas,
role restrictions and lifecycle denial. Adapt framework tests to the expanded
canonical migrations/seeds without running reset on the persistent developer DB.
Finally provision the persistent DB, verify counts/joins, restart it, launch HCM
locally, inspect the browser/API and run lint, types, tests, format, architecture,
documentation and production builds. Leave the database and app available for testing.
