# HCM Shell + Theme Lab validation

This is a historical record for the earlier shell milestone. Current lab verification lives in the [Foundation Lab acceptance record](../../ux/theme-lab/ACCEPTANCE-CRITERIA.md).

> Historical shell milestone record. The preview implementation and current acceptance evidence are superseded by the [production floorplan correction](../../ux/floorplans/validation.md).

Validated locally on **2026-09-22**. This record applies to the source milestone described in the [maintainer guide](README.md) and [TDD](../../tdd/TDD-HCM-SHELL-THEME-LAB.md); it is not a DEV deployment record.

## Verified behavior

| Check                            | Result                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affected Nx lint, test and build | Passed for 22 projects, 39 targets, with sequential execution; 29 successful targets were reused from cache                                                               |
| HCM unit tests                   | All 15 tests passed across the app and five new libraries                                                                                                                 |
| Browser tests                    | All 12 cases passed: four scenarios each in Chromium, Firefox and WebKit                                                                                                  |
| HCM production build             | Passed within existing budgets; initial bundle 363.62 kB, estimated transfer 94.77 kB                                                                                     |
| Project boundaries               | Architecture verifier and Nx graph passed review; shell and Theme Lab load lazily, the feature does not import the shell, and the catalog does not import runtime context |
| Tooling and documentation        | Tooling ESLint, architecture/documentation checks, formatting and Git whitespace checks passed                                                                            |
| Documentation links and diagrams | Changed Markdown file links resolved; both new Mermaid diagrams rendered successfully                                                                                     |
| HER integrity                    | Both supplied and materialized stylesheets match the original SHA-256                                                                                                     |

The browser scenarios cover all sixteen theme/preview combinations, native SAP light/dark parameters, distinct semantic surfaces, valid and invalid tenant colors, clearing the overlay, role/entitlement changes, and 390px layouts without page-wide horizontal overflow. Desktop and narrow layouts were also visually inspected. The table preserves horizontal scrolling inside its own container.

Unit coverage includes any-role/all-entitlement catalog rules, pruning, fixture mutations, hexadecimal validation, accent text contrast, complete bridge cleanup, serialized native theme changes, and recovery from asset-loading failures.

The preserved HER checksum is:

```text
f7718d406bb464a6c4909675fca385da1246a13a2c0cf43d57710111f51b89ac
```

## Repeat the acceptance pass

Follow [Validate a change](README.md#validate-a-change). For the full affected graph and browser matrix:

```sh
pnpm nx affected -t lint test build --uncommitted --parallel=1
pnpm exec playwright test --config=apps/hcm/web-e2e/playwright.config.mts --workers=1
```

On Windows, if Nx plugin workers fail before graph creation, the local verification used these PowerShell environment settings:

```powershell
$env:NX_DAEMON='false'
$env:NX_ISOLATE_PLUGINS='false'
```

An initial run of Nx and browser checks together exhausted workstation memory and crashed several processes. The sequential acceptance pass completed successfully without disabling tests or relaxing checks. Existing Account/Console welcome-component style-budget warnings and Nx executor deprecation notices remain outside this milestone; HCM's replacement has no style-budget warning.

## Scope limits

- Context, roles, entitlements and tenant branding are fictional in-memory fixtures. No authentication, backend bootstrap, persistence or authorization implementation was added.
- The four previews are schematic layout exercises. Production floorplans, domain transactions and a complete accessibility audit remain future work.
- Contrast checks cover derived tenant accent text states. They do not certify every color pairing in the preserved HER source palette.
- No image publication or GCP deployment was performed for this milestone. The [recorded DEV release](../../../platform/engineering/dev-deployment.md) remains the previous scaffold until reviewed release and manual promotion.
