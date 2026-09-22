# HCM Theme Architecture

## Theme layers

```text
UI5 base theme
  + empFLOWyee semantic theme palette
  + governed tenant brand accent
```

### UI5 base

- light: `sap_horizon`
- dark: `sap_horizon_dark`

### empFLOWyee palette

- Horizon Light/Dark map empFLOWyee semantic tokens to SAP theme parameters/fallbacks.
- HER Light/Dark use the supplied warm cinematic palette while leaving UI5 controls structurally native Horizon.

### Tenant accent

Tenant onboarding may choose one primary color. The client derives approved accent states and readable foreground color. It is not a tenant-authored CSS theme.

## Why HER is not a replacement UI5 theme

The current HER file defines `--ef-*` product semantic tokens. It does not provide the complete SAP theme parameter set needed to become a standalone UI5 theme. Keeping native Horizon as the UI5 base preserves control behavior and SAP's maintained theming/accessibility work.

If a future requirement needs every UI5 parameter recolored comprehensively, evaluate SAP Theme Designer/custom theme assets as a separate ADR.

## Native-control theme bridge

`HcmThemeService` applies the supplied HER semantic palette to public SAP parameters consumed by the actual UI5/Fundamental controls. The mapping lives in `libs/hcm/web/ux/theme/src/lib/hcm-sap-theme-parameters.ts`; emphasized action states remain beside the mapping in the service.

- HER surfaces cover native page headers, forms, fields, lists and tables.
- Native text, labels, links, tabs, ordinary actions and the default avatar use the HER palette.
- Feedback retains semantic success/warning/error/information distinctions from the supplied HER tokens.
- Tenant branding changes the independent accent and action colors, preserving the selected theme surfaces.
- Every owned parameter is removed before applying another selection and on teardown. Horizon without tenant branding receives no inline palette overrides.

The previous emphasis-only bridge left native controls visibly on Horizon while their surrounding product surfaces used HER. It did not satisfy the theme requirement. The correction changes public parameters only: no custom control skin, Shadow DOM selectors or modified upstream packages. The family-scoped `_hcm-theme-native.scss` also replaces baked-in field underline/shadow colors through public SAP decoration parameters, retaining native geometry and readonly dashes. These declarations stop applying immediately when the HER family selector is removed.

Tenant color validation accepts only three/six-digit hex, normalizes case/length,
and leaves the accepted color unchanged on error. WCAG relative luminance selects
the better black/white foreground; hover/active states retain at least 4.5:1 against
that foreground. Strong accent text is adjusted separately for the surface. This
is accent validation, not certification of an arbitrary full tenant theme.

## Supplied HER integrity

The original and materialized `_hcm-theme-her.scss` must retain SHA-256
`f7718d406bb464a6c4909675fca385da1246a13a2c0cf43d57710111f51b89ac`.
Both copies are excluded from formatting and Git line-ending conversion.
Run `pnpm exec node tools/milestones/hcm-shell-theme-lab/verify-bundle.mjs` from the
repository root after theme work. Changes to supplied HER values require explicit
design review; the milestone did not rewrite them.

Operational instructions and diagrams are in the [maintainer guide](README.md).

## Native Angular integration and ownership

The corrected foundation uses `provideHcmUx()` in both application and Storybook. `HcmNativeThemeService` coordinates UI5 `setTheme` with Fundamental's maintained `ThemingService`, waits for the local SAP/Fundamental stylesheets, and only then permits semantic palette application. Fonts and native theme assets share `/assets/hcm/` in both hosts; CDN font loading is disabled in their common UI5 initialization.

The developer default is Horizon Light without tenant branding. **No tenant override** clears only the accent. HER selectors remain family/variant scoped; the shared token contract defines surface aliases for Horizon too. The supplied HER file remains byte-for-byte unchanged.

`variant` is the requested choice; `appliedVariant` records the last successful choice. `loading` and `error` are observable. The canvas remains hidden during a pending transition. On teardown, the service invalidates pending palette work, clears its inline overrides, family/variant/loading attributes, color scheme and native stylesheet links. UI5's global asset registry is reused; a subsequent HCM owner always explicitly selects its base theme.

Verify HER-to-Horizon and tenant-overlay removal within one browser document, not only fresh navigations. A failed request must not update `appliedVariant`. The service reports failure so the host can request a new selection or reload.

Preserve the SAP asset directory structure under `/assets/hcm/theming/Base/baseLib/`: the maintained CSS contains relative font URLs. The native loader checks the loaded stylesheet URL, not just `link.sheet`, because Firefox can retain the old sheet while a new href is loading.
