# Theme Lab token contract

## Principle
Settings edits a finite semantic token contract. It does not edit arbitrary CSS selectors.

## HER token groups

### Accent / brand
- `--ef-color-accent`
- `--ef-color-accent-strong`
- `--ef-color-accent-hover`
- `--ef-color-accent-active`
- `--ef-color-on-accent`

### Text
- `--ef-text-strong`
- `--ef-text-muted`
- `--ef-text-subtle`

### Surfaces
- `--ef-surface-canvas`
- `--ef-surface-base`
- `--ef-surface-accent`
- `--ef-list-hover-surface`
- `--ef-list-active-surface`

### Borders / focus
- `--ef-border-subtle`
- `--ef-focus-color`

### Semantic statuses
Neutral, positive, critical, negative, information:
- surface
- border
- text

### Geometry
- `--ef-radius-control`
- `--ef-radius-surface`
- `--ef-radius-hero`

### Shadows
- `--ef-shadow-control`
- `--ef-shadow-surface`
- `--ef-shadow-hero`

## Settings UI

Use UI5 controls themselves to edit the theme:

- ColorPicker / Input for colors
- Slider / StepInput for numeric values where suitable
- Select for presets
- Switch for optional token features
- MessageStrip for invalid values/contrast
- Table for token overview
- Dialog for import/export confirmation

Changes must reflect immediately in all Home/Demo controls.

## Reset rules

Switching to Horizon:
- remove `data-hcm-theme-family='her'`
- remove HER variant attribute
- remove all inline Theme Lab token overrides
- remove tenant preview bridge if tenant override is disabled

Switching back to HER reapplies the selected HER defaults plus any current Theme Lab override map.

## Implemented validation and bridge

The finite implementation contract lives in `libs/hcm/web/ux/theme/src/lib/her-token-contract.ts`. Colors accept `#RGB` or `#RRGGBB`; radii accept nonnegative px/rem values up to 32px/2rem; shadows accept `none` or the three checked-in HER shadow values. Imports reject unknown top-level fields, unknown tokens, unsupported schema versions, non-HER bases and invalid tenant accents before changing state. Documents are limited to 20,000 characters.

The native bridge maps these semantics into confirmed public SAP parameters for shell/page/form surfaces, text, fields, selection, semantic tags, buttons, radii and shadows. It never selects private Shadow DOM. On Horizon the diagnostic attributes identify the selected Horizon family/variant; no attribute value selects HER rules. Inline HER/SAP overrides are removed, except the independent accent bridge when tenant branding remains enabled.

The contrast warning checks text-strong and text-muted against surface-base, plus on-accent against accent at 4.5:1. Other states still require visual/accessibility review. See the [maintainer guide](README.md#theme-ownership-and-reset) for reset and export behavior.
