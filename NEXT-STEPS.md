# Next steps after factory installation

Follow the proposed [HCM-0 work breakdown](docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md)
for dependencies, exact repository ownership, approval gates and acceptance criteria.
The [installation report](docs/hcm/engineering/FACTORY-INSTALLATION-REPORT.md)
records what is already installed.

The factory, HCM0-01 catalogue launchpad and isolated local personas are implemented.
HCM0-02 adds the [SQL-first database foundation](docs/hcm/engineering/DATABASE-OPERATIONS.md).
HCM0-03 adds the [versioned seed framework](docs/hcm/engineering/DEVELOPMENT-SEEDS.md)
with four persisted Dunder Mifflin modules. The approved
[minimal platform spine](docs/hcm/domain/PLATFORM-SPINE.md) and
[database-backed runtime](docs/hcm/tdd/TDD-HCM-PERSISTENT-RUNTIME.md) complete the
local tenant/persona integration through the existing session contract.
Do not reinstall the factory or regenerate the planned tree to repeat those milestones.

1. Complete HCM0-05: executable app blueprint/readiness gate and evidence for prerequisite milestones.
2. Extend domain-owned Dunder Mifflin seed modules only alongside approved domain migrations; the minimal workforce identity spine is already populated.
3. Design production authentication and database deployment separately; local runtime success does not approve either deployment boundary.
4. Finalize HCM-1 FDDs/TDDs and unresolved blockers, then implement its domain foundations/app slices.
5. Finalize HCM-2 FDD/TDD set and use Employee Directory as the first from-zero reference business app.
