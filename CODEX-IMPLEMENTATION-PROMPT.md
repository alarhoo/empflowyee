# HCM UX correction procedure

The earlier catalog materialization prompt is superseded by the approved audit correction. Read [AGENTS.md](AGENTS.md), the [reuse ADR](docs/hcm/adr/ADR-0004-floorplan-reuse-first.md), [implementation design](docs/hcm/tdd/TDD-HCM-UX-FLOORPLANS-STORYBOOK.md), [capability matrix](docs/hcm/ux/floorplans/component-capability-matrix.md) and [Storybook guide](docs/hcm/ux/storybook.md).

Before further implementation:

```bash
node tools/ux/check-component-entrypoints.mjs
node tools/ux/check-storybook-readiness.mjs
```

The approved iteration is limited to Dynamic Page and Object Page, theme isolation and shared application/Storybook consumption. Use installed maintained APIs. Do not regenerate existing libraries, expand the catalog, add another product Storybook or introduce a separate mock layout.

Use official Nx generators when a justified new library is required. A native wrapper may be composed only for genuine empFLOWyee responsibilities, such as state/action conventions; do not normalize APIs for appearance alone. Preserve all dependency restrictions.

Record actual checks in [validation](docs/hcm/ux/floorplans/validation.md). Historical generator commands are in [NX-COMMANDS.md](tools/milestones/hcm-ux-floorplans-storybook/NX-COMMANDS.md).
