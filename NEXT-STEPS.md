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

HCM0-05's [blueprint/readiness gate](docs/hcm/engineering/APP-READINESS.md) is now
implemented with app/wave context reports, adversarial tests and CI enforcement for
apps claiming approval or implementation. All 170 planned apps still require their
own reviewed designs before implementation.

1. Review the completed [20-app HCM-1 design package](docs/hcm/roadmap/HCM-1-DESIGN-REVIEW.md). The stage, access policy and bounded document/notification behavior are approved; no business-policy question remains open for the local scope. Production authentication and external integrations remain deferred.
2. Record actual approval of the exact app/shared document revisions, publish reviewed route/floorplan/readiness catalogue summaries and rerun every local-stage app gate before separately authorized implementation; retain the full-wave gate for eventual HCM-1 completion.
3. Extend domain-owned Dunder Mifflin seed modules only alongside approved domain migrations; the minimal workforce identity spine is already populated.
4. Design production authentication and database deployment separately; local runtime success does not approve either deployment boundary.
5. Implement admitted HCM-1 domain/app slices one at a time, preserving real-data and tenant-isolation requirements.
6. Finalize HCM-2 FDD/TDD set and use Employee Directory as the first from-zero reference business app.
