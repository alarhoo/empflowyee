# Next steps after factory installation

Follow the proposed [HCM-0 work breakdown](docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md)
for dependencies, exact repository ownership, approval gates and acceptance criteria.
The [installation report](docs/hcm/engineering/FACTORY-INSTALLATION-REPORT.md)
records what is already installed.

The factory, HCM0-01 catalogue launchpad and isolated local personas are implemented.
HCM0-02 adds the [SQL-first database foundation](docs/hcm/engineering/DATABASE-OPERATIONS.md).
Do not reinstall the factory or regenerate the planned tree to repeat those milestones.

1. Build HCM0-03: versioned PostgreSQL development seed tooling with the approved fictional tenant dataset.
2. Integrate persisted development tenant/persona data through the established session contract when the owning domain schema is approved; external production authentication remains separate.
3. Complete HCM0-05: executable app blueprint/readiness gate and evidence for prerequisite milestones.
4. Finalize HCM-1 FDDs/TDDs and unresolved blockers, then implement its domain foundations/app slices.
5. Finalize HCM-2 FDD/TDD set and use Employee Directory as the first from-zero reference business app.
