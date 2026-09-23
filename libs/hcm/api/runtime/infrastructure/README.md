# hcm-api-runtime-infrastructure

Owns fail-closed unconfigured adapters and the explicitly opted-in loopback-only
development tenant/session adapters. A private Kysely pool reads the persisted
platform spine with the restricted runtime role and transaction-local RLS context.
There are no in-memory tenant, persona or capability fallbacks.

See the [shell maintainer guide](../../../../../docs/hcm/architecture/shell/README.md). The HCM API build compiles this non-buildable library. Boundary integration tests run with `pnpm nx test hcm-api-runtime-module`.

Provision with `pnpm hcm:db:up`, then run `pnpm dev:hcm-api`. Neither adapter runs
migrations or seeds. See [database operations](../../../../../docs/hcm/engineering/DATABASE-OPERATIONS.md)
and the [persistent runtime design](../../../../../docs/hcm/tdd/TDD-HCM-PERSISTENT-RUNTIME.md).
