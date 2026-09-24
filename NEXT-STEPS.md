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
apps claiming approval or implementation. The 20 approved HCM-1 local apps now
pass their document admission gates; remaining planned apps require their own designs.

1. Review the completed [Role Management](docs/hcm/testing/HCM-1-ROLE-OBJECT-PAGE-VALIDATION.md) and [Access Assignments](docs/hcm/testing/HCM-1-ACCESS-ASSIGNMENTS-VALIDATION.md) slices, then deliver Identity Administration on its next granular feature branch. The [access/audit foundation](docs/hcm/testing/HCM-1-ACCESS-AUDIT-VALIDATION.md) and [20-app approval](docs/hcm/roadmap/HCM-1-IMPLEMENTATION-APPROVAL.md) are in place.
2. Follow the [local implementation order](docs/hcm/roadmap/HCM-1-LOCAL-DELIVERY.md), one coherent app/domain slice at a time. Each slice requires API/RLS, native UI, real-browser acceptance and review gates before becoming Available.
3. Extend domain-owned seed modules with forward migrations; never rewrite applied HCM-0 or HCM-1 versions. The persistent local database now includes the business permission register and protected development roles.
4. Keep the six deferred apps Planned. Production authentication and external integrations require separate approved designs.
5. Finalize HCM-2 FDD/TDD separately; it is not authorized by HCM-1 local-stage admission.
