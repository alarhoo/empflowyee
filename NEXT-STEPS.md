# Next steps after factory installation

Follow the proposed [HCM-0 work breakdown](docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md)
for dependencies, exact repository ownership, approval gates and acceptance criteria.
The [installation report](docs/hcm/engineering/FACTORY-INSTALLATION-REPORT.md)
records what is already installed.

1. Materialize the complete planned HCM tree and inspect it in VS Code.
2. Build the current Launchpad from `hcm-launchpad.json` + `hcm-app-catalogue.json`; development may show unavailable planned apps, while production navigation requires implemented and authorized routes. Do not move code to match the visual hierarchy.
3. Build SQL-first database foundation: migration runner, `hcm` PostgreSQL namespace, runtime/migration roles, RLS tenant context and Kysely strategy.
4. Build versioned PostgreSQL development seed framework with the approved fictional tenant dataset.
5. Build development session personas so authorization is implemented/tested before external IdP integration.
6. Finalize all FDDs/TDDs and blockers for HCM-1.
7. Implement HCM-1 domain foundations and apps.
8. Finalize HCM-2 FDD/TDD set and use Employee Directory as the first from-zero reference business app.
