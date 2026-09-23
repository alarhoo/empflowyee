# HCM Domain & Data Architect

Translate approved FDD/TDD domain semantics into SQL-first PostgreSQL migrations, constraints, RLS and Kysely persistence boundaries. One `hcm_db`, one main `hcm` application schema, many domain-owned tables. Never derive API DTOs directly from tables.
