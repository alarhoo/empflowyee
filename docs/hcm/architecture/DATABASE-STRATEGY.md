# HCM PostgreSQL strategy

## The terms

A PostgreSQL **database** is a database container. A PostgreSQL **schema** is a namespace inside that database. A schema contains many tables, views, functions, policies and other objects.

For empFLOWyee v3:

```text
Cloud SQL PostgreSQL instance (per environment)
└── hcm_db                         database
    └── hcm                        application schema / namespace
        ├── tenant                 table
        ├── person                 table
        ├── worker                 table
        ├── employment             table
        ├── assignment             table
        ├── reporting_line         table
        ├── leave_request          table
        ├── leave_balance          table
        ├── project                table
        ├── timesheet              table
        ├── ... hundreds more as domains are implemented
        ├── views
        ├── indexes
        ├── constraints
        ├── triggers where justified
        └── row-level-security policies
```

**One shared HCM schema does not mean one table.** It means one primary namespace containing all HCM business objects.

## Why not one schema per tenant

We are building shared-schema multi-tenancy. Acme, Dunder Mifflin and Globex rows coexist in the same tenant-owned tables and are separated by `tenant_id` plus authorization/RLS.

```text
hcm.employee/worker/etc.
+----------------+-----------+------------------+
| tenant_id      | id        | ...              |
+----------------+-----------+------------------+
| DUNDER_MIFFLIN | ...       | ...              |
| ACME           | ...       | ...              |
| GLOBEX         | ...       | ...              |
+----------------+-----------+------------------+
```

This is operationally cheaper and far easier to migrate than a database or schema per customer.

## Why not one schema per domain

Do not create `employee`, `leave`, `payroll`, etc. PostgreSQL schemas simply to mirror code boundaries. Domain boundaries are enforced by Nx, NestJS module architecture, contracts, ownership, and tests. Database-level domain schemas would add cross-schema migration/query friction without giving us tenant isolation.

## SQL-first authority

- SQL migrations are authoritative for physical schema.
- Kysely is the typed query layer; it is not the schema generator.
- Never expose database rows directly as API contracts.
- Contract DTOs are designed separately from persistence tables.
- Merged/applied migrations are immutable; changes use a new migration.
- Migrations are owned by the domain making the change.
- A single migration runner applies all approved domain migrations in deterministic order.

## Tenant isolation

Every tenant-owned row must have unambiguous tenant ownership. Prefer a direct `tenant_id` column on tenant-owned tables where practical, even if ownership can be inferred through a parent, because this keeps RLS policies reviewable and efficient.

Target runtime model:

1. API authenticates/resolves tenant context.
2. A DB transaction sets transaction-local tenant context.
3. PostgreSQL RLS uses that context to restrict rows.
4. Runtime DB role does not have `BYPASSRLS` and does not own the tables.
5. Cross-tenant/operator access requires a separate explicitly privileged and audited path; it is never the normal HCM API role.

RLS is defense in depth. API permission checks remain mandatory.

## Global/reference data

Not every table is tenant-owned. Product-owned immutable/reference classifications can be global when the domain model requires them. Their ownership must be explicit; absence of `tenant_id` is never accidental.

## Development seed

Dunder Mifflin is the canonical development/demo tenant. Seed data is inserted into PostgreSQL through versioned seed tooling. Production Angular features never import fixture arrays as business data.
