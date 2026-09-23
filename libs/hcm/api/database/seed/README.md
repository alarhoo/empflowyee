# hcm-api-database-seed

Server-only versioned seed infrastructure for the explicitly approved local
Dunder Mifflin target. The canonical manifest starts empty; domain modules require
approved migrations and remain separate from tenant/session setup.

`runDevelopmentSeeds` validates local configuration, the database marker, schema
history, dependency graph and immutable checksums before applying data. The CLI
supplies the canonical migration inventory from the HCM0-02 loader. Each apply
module commits with its ledger row; an explicitly confirmed reset is atomic across
all applied modules in reverse order. Never import this into API startup or browser code.

Run `pnpm hcm:db:seed` only after local provisioning/migrations and explicit
environment configuration. `pnpm nx test hcm-api-database-seed` verifies the framework
against disposable PostgreSQL. See the
[operator procedure](../../../../../docs/hcm/engineering/DEVELOPMENT-SEEDS.md) and
[design](../../../../../docs/hcm/tdd/TDD-HCM-0-SEEDS.md).
