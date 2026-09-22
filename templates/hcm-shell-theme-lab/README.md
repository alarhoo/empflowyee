# Supplied HCM milestone templates

These files preserve the source bundle used to materialize HCM Shell + Theme Lab. JavaScript/TypeScript comments and formatting follow repository policy; the supplied HER SCSS is byte-for-byte unchanged.

The templates are design references, not an additional application or an Nx project. Do not copy them over the working implementation: they predate the catalog dependency correction, asynchronous theme queue, contrast fixes, mock-session controls and preview component split.

Maintain the generated libraries under `libs/hcm/web`. Read the [TDD materialization record](../../docs/hcm/tdd/TDD-HCM-SHELL-THEME-LAB.md#13-materialization-record) and [maintainer guide](../../docs/hcm/architecture/shell/README.md) before changing those libraries. The integrity check compares the template and implementation copies of the supplied HER stylesheet.
