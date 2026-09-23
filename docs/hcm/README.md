# HCM frontend

HCM is one Angular application composed from Nx libraries. The shell uses API-driven tenant/session bootstrap and permission/entitlement/flag-aware navigation. Its server session adapter remains fail-closed until configured. The Theme Lab at `/ux/theme-lab` exercises four Horizon/HER variants, an optional tenant accent and production floorplan proofs with fictional visual data.

Start with the [production shell guide](architecture/shell/README.md) and [TDD](tdd/TDD-HCM-PRODUCTION-SHELL.md) for runtime operation. The [factory installation report](engineering/FACTORY-INSTALLATION-REPORT.md), [canonical catalogue](catalogue/HCM-APP-CATALOGUE.md) and [HCM-0 work breakdown](roadmap/HCM-0-WORK-BREAKDOWN.md) describe engineering tooling and planned integration.

## Read before changing HCM

The [Storybook workshop](ux/storybook.md) renders those same production implementations with meaningful interaction/state examples. Other generated floorplans and supporting form/table adapters are deferred. See the [floorplan API guide](ux/floorplans/README.md) and [workshop TDD](tdd/TDD-HCM-UX-FLOORPLANS-STORYBOOK.md) before building reusable UX. The workshop does not replace the application shell or implement production authentication.

- [HCM UI stack](ux/UI-LIBRARY-DECISION.md) and [capability matrix](ux/COMPONENT-CAPABILITY-MATRIX.md)
- [Shell composition](architecture/shell/overview.md)
- [Runtime context](architecture/shell/runtime-context.md)
- [Application catalog](architecture/shell/application-catalog.md)
- [Theme architecture](architecture/shell/theming.md) and [HER overlay ADR](adr/ADR-0002-her-theme-as-horizon-overlay.md)
- [Signals and forms](../platform/frontend/angular-state-and-forms.md)
- [Nx taxonomy](../platform/engineering/nx/project-taxonomy.md) and [dependency rules](../platform/engineering/nx/dependency-rules.md)

The shell fetches runtime API contracts, but production sign-in, persisted user preferences and business transactions remain unimplemented. Catalog filtering controls navigation presentation only. Server-side authorization remains required before any real domain feature is exposed. The installed factory does not make any business app implementation-ready.
