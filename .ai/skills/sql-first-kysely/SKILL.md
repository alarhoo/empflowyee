# SQL-first PostgreSQL + Kysely

Physical schema is defined by SQL migrations. Kysely is the typed query layer. Migrations add constraints/indexes/RLS as required. Never let an ORM generate the authoritative schema. Never expose persistence rows as DTOs. Seed Dunder Mifflin through versioned DB seed tooling.
