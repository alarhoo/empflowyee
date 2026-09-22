# HCM frontend

HCM is one Angular application composed from Nx libraries. The current product milestone implements a fixture shell and Theme Lab at `/ux/theme-lab`: four Horizon/HER variants, an optional tenant accent, role/entitlement-aware navigation, and four schematic enterprise layouts.

Start with the [Shell + Theme Lab maintainer guide](architecture/shell/README.md) for running, testing and changing this implementation. The [TDD](tdd/TDD-HCM-SHELL-THEME-LAB.md) records the approved design and materialization decisions.

## Read before changing HCM

- [HCM UI stack](ux/UI-LIBRARY-DECISION.md) and [capability matrix](ux/COMPONENT-CAPABILITY-MATRIX.md)
- [Shell composition](architecture/shell/overview.md)
- [Runtime context](architecture/shell/runtime-context.md)
- [Application catalog](architecture/shell/application-catalog.md)
- [Theme architecture](architecture/shell/theming.md) and [HER overlay ADR](adr/ADR-0002-her-theme-as-horizon-overlay.md)
- [Signals and forms](../platform/frontend/angular-state-and-forms.md)
- [Nx taxonomy](../platform/engineering/nx/project-taxonomy.md) and [dependency rules](../platform/engineering/nx/dependency-rules.md)

The fixture does not authenticate users, fetch HCM API data, persist preferences, or implement business transactions. Catalog filtering controls navigation presentation only. Server-side authorization remains required before any real domain feature is exposed.
