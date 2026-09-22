# HCM frontend

HCM is one Angular application composed from Nx libraries. The current product milestone implements a fixture shell and Theme Lab at `/ux/theme-lab`: four Horizon/HER variants, an optional tenant accent, role/entitlement-aware navigation, and the two production floorplan proofs: Dynamic Page and Object Page.

Start with the [Shell + Theme Lab maintainer guide](architecture/shell/README.md) for running, testing and changing this implementation. The [TDD](tdd/TDD-HCM-SHELL-THEME-LAB.md) records the approved design and materialization decisions.

## Read before changing HCM

The [Storybook workshop](ux/storybook.md) renders those same production implementations with meaningful interaction/state examples. Other generated floorplans and supporting form/table adapters are deferred. See the [floorplan API guide](ux/floorplans/README.md) and [workshop TDD](tdd/TDD-HCM-UX-FLOORPLANS-STORYBOOK.md) before building reusable UX. The workshop does not replace the application shell fixture or implement production authentication.

- [HCM UI stack](ux/UI-LIBRARY-DECISION.md) and [capability matrix](ux/COMPONENT-CAPABILITY-MATRIX.md)
- [Shell composition](architecture/shell/overview.md)
- [Runtime context](architecture/shell/runtime-context.md)
- [Application catalog](architecture/shell/application-catalog.md)
- [Theme architecture](architecture/shell/theming.md) and [HER overlay ADR](adr/ADR-0002-her-theme-as-horizon-overlay.md)
- [Signals and forms](../platform/frontend/angular-state-and-forms.md)
- [Nx taxonomy](../platform/engineering/nx/project-taxonomy.md) and [dependency rules](../platform/engineering/nx/dependency-rules.md)

The fixture does not authenticate users, fetch HCM API data, persist preferences, or implement business transactions. Catalog filtering controls navigation presentation only. Server-side authorization remains required before any real domain feature is exposed.
