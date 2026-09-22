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

## Implemented accent bridge

`HcmThemeService` owns and clears these public SAP parameters:

- `--sapBrandColor`, `--sapHighlightColor`, `--sapSelectedColor`
- `--sapButton_Emphasized_Background`, `--sapButton_Emphasized_BorderColor`
- `--sapButton_Emphasized_Hover_Background`, `--sapButton_Emphasized_Hover_BorderColor`
- `--sapButton_Emphasized_Active_Background`, `--sapButton_Emphasized_Active_BorderColor`
- `--sapButton_Emphasized_TextColor`, `--sapButton_Emphasized_Hover_TextColor`, `--sapButton_Emphasized_Active_TextColor`
- `--sapContent_FocusColor`

The bridge reads semantic accent/strong/hover/active/on-accent tokens and applies only
this list. It runs for HER and for branded Horizon; unbranded Horizon removes it.
It does not recolor every control or change a UI5 shadow tree. SAP status and ordinary
control colors remain native. The service awaits serialized `setTheme` calls before
applying the matching surfaces, skips stale requests, and reports loading errors.

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
