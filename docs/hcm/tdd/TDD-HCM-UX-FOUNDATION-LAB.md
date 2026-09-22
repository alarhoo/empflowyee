# TDD — HCM UX Foundation Lab

## 1. Nx placement

Recommended existing/new libraries:

```text
libs/hcm/web/ux/
├── theme/                  # existing/approved theme engine
├── floorplans/object-page/ # reusable native DynamicPage + tabbed sections
├── floorplans/tool-page-layout/ # reusable native NavigationLayout integration
└── feature-theme-lab/      # lazy-loaded consumer with fictional feature content
```

The two authorized pilots live in floorplan libraries before validation in Theme Lab. Tags are `product:hcm`, `runtime:web`, `domain:ux`, `type:floorplan`. They contain no fixtures, business behavior or API dependencies. Additional floorplans are outside this iteration. Native naming wrappers are allowed; native interaction and accessibility must remain intact.

Suggested tags for the feature:

```text
product:hcm
runtime:web
domain:ux
type:feature
```

## 2. Primary UI5 controls

Use official current UI5 capability documentation as the design source of truth. At implementation time verify the repository's selected package version supports the documented import. If it does not, resolve version alignment; do not create a fallback imitation.

Required shell/layout controls:

- ShellBar
- TabContainer
- NavigationLayout
- SideNavigation
- FlexibleColumnLayout
- DynamicPage and/or Page where useful

Required enterprise controls include:

- Avatar / AvatarGroup
- Button / ToggleButton / SplitButton
- Bar / Toolbar
- Breadcrumbs
- BusyIndicator
- Card / Panel
- CheckBox / RadioButton / Switch
- ComboBox / MultiComboBox / Select
- Input / MultiInput / TextArea / StepInput
- DatePicker / DateRangePicker / DateTimePicker / TimePicker / DynamicDateRange
- Form / FormGroup / FormItem
- Label / Text / Title / Link / ExpandableText
- MessageStrip / Toast / IllustratedMessage
- Dialog / Popover / ResponsivePopover
- ProgressIndicator / RatingIndicator / Slider / RangeSlider
- SegmentedButton
- Tag / Token / Tokenizer
- Table and table features
- Tree/List where meaningful
- Timeline
- FileUploader / UploadCollection
- Menu / ViewSettingsDialog / UserSettingsDialog where meaningful
- Calendar / CalendarLegend where meaningful

Controls that have no realistic HCM use do not need to be forced into Employee Profile. Put them in Leave/Projects or omit with documented rationale.

## 3. NavigationLayout decision

Use `HcmToolPageLayout` from `@empflowyee/hcm-web-ux-floorplan-tool-page-layout`; it projects directly into `ui5-navigation-layout`.

UI5 owns header, SideNavigation, content layout and phone dismissal. The integration exposes native Auto/Expanded/Collapsed modes, navigation toggle and a resize refresh using the supported native API. Features project a native header element, SideNavigation and their Page/FCL content. No CSS navigation engine is introduced.

## 4. Flexible Column Layout

Apply the [HCM page layout standard](../ux/page-layout.md) throughout the lab and reusable pilots. Each occupied FCL column is a Page, DynamicPage or page-backed feature component. Headers are mandatory; footers are optional. The application and Storybook share one 90rem centered canvas with responsive outer gutters. Nested pages fill their column instead of adding independent width caps.

Every Demo area uses FCL.

Employee example:

```text
Begin
  employee list

Mid
  selected employee profile

End
  selected sub-object / event / document / leave item
```

Responsive rules:
- desktop: 2–3 columns as layout requires
- tablet: reduce columns according to component behavior
- phone: one logical column at a time

The lab must use the component API rather than hand-written grid widths.

## 5. Object Page pattern

Do not assume a raw `ObjectPage` Web Component exists.

Employee detail consumes `HcmObjectPage` and `HcmObjectSection` from the reusable Object Page library. That library owns native DynamicPage, title/header, toolbar and tabbed sections; LabProfile supplies employee fields, section content and local edit actions. Section navigation uses native tabs, not stacked anchor scrolling.

If the installed Fundamental NGX stack exposes a maintained Object Page abstraction suitable for production, prefer it and update this TDD.

## 6. Theme engine

Theme state model:

```ts
type HcmThemeVariant =
  | 'horizon-light'
  | 'horizon-dark'
  | 'her-light'
  | 'her-dark';
```

Resolution:

```text
horizon-light -> setTheme('sap_horizon') + remove HER attrs/tokens
horizon-dark  -> setTheme('sap_horizon_dark') + remove HER attrs/tokens
her-light     -> setTheme('sap_horizon') + HER light tokens
her-dark      -> setTheme('sap_horizon_dark') + HER dark tokens
```

Additional theme assets must be imported for non-default themes:
- main UI5 Assets
- Fiori UI5 Assets

This is required to avoid the previous "Theme assets could not be loaded" failure.

## 7. Theme token layering

Three layers:

```text
UI5 base theme
   ↓
empFLOWyee HER semantic layer
   ↓
tenant branding overlay
```

Semantic empFLOWyee tokens remain `--ef-*`.

Settings edits only the semantic token layer.

Tenant primary color should derive a controlled state palette, not allow arbitrary CSS.

At minimum bridge confirmed global SAP theme variables where appropriate, e.g. brand/highlight/background/text/shell variables. Any additional SAP variable override must be validated against the maintained theming-base-content contract before use.

## 8. Settings architecture

Use signal state.

Recommended models:
- `ThemeLabSettingsStore`
- `HcmThemeService`
- `HerTokenEditorStore`
- `TenantBrandPreviewService`

Do not persist changes to customer configuration.

Optional developer persistence:
- session/local browser storage is acceptable only for the Theme Lab and must be namespaced.

Export format:

```json
{
  "schemaVersion": 1,
  "base": "her-dark",
  "tenantPrimary": "#b74435",
  "tokens": {
    "--ef-color-accent": "#b74435"
  }
}
```

## 9. Demo data

Use deterministic fictional Office-style fixtures.

Suggested employees:
- Michael Scott
- Jim Halpert
- Pam Beesly
- Dwight Schrute
- Angela Martin
- Kevin Malone
- Oscar Martinez
- Toby Flenderson

Use obviously fictional IDs/domains.

## 10. Cleanup from previous lab

Replace or remove:
- custom CSS imitations of DynamicPage/Page/FCL/native controls
- duplicate hand-built shell/navigation when UI5 native controls can serve the requirement
- theme logic that leaves HER variables active when Horizon is selected
- old Storybook-specific floorplan copies from the critical UX path

Storybook files may remain if harmless, but they are not part of this milestone and must not drive the implementation.

## 11. Implemented placement and integration

The existing `feature-theme-lab` contains feature-local `LabDemoComponent`, `LabProfileComponent`, `LabSettingsComponent` and `LabSettingsStore`. LabDemo consumes the shared ToolPageLayout; LabProfile consumes the shared Object Page. Both reusable pilots live under `libs/hcm/web/ux/floorplans`. Demo and Settings instantiate on first visit through Angular `@defer` and retain their local state afterward. One maintained FCL instance serves all three demo areas using native layout values; there is no CSS column simulation.

The Object Page pilot now uses native UI5 DynamicPage and TabContainer rather than the earlier Fundamental Core/Platform stacked composition. Native header snapping, pinning, action overflow and tab navigation remain library-owned. The existing Object Page API and Storybook consumer are retained. Pilot implementation does not itself grant feature-adoption approval.

The shared theme library owns `her-token-contract.ts`; one feature settings store owns ephemeral preview state. Separate token/tenant stores were unnecessary. Native assets and locale data are bundled from the maintained packages; the theme bridge uses public parameters verified against the installed SAP theming-base-content CSS. Reads are batched before writes, and unchanged native bases are reused during semantic edits.

`hcm-web-runtime-context` owns `HcmBrowserRuntimeConfig` and its strict parser. The platform loader accepts a product parser without importing HCM policy. `canMatch` gates the lazy lab outside the ordinary business shell, using the PROD-off rules in the [maintainer guide](../ux/theme-lab/README.md#runtime-gate).

Tables, searches and sorting are explicitly client-owned fixture operations. Signal Forms hold editable profile, request and JSON drafts. Locale previews load UI5 language assets; timezone is a fixed-appointment formatting preview, not a global change to employee dates. No settings or business changes are persisted.


The installed NavigationLayout 2.26.0 computes `Auto` collapse at render time but does not observe viewport resize. The feature calls its public `isSideCollapsed()` API after restoring `Auto` on a window resize. Native NavigationLayout CSS performs the mobile slide-out; native FCL still owns all column widths. This is Angular integration, not a substitute layout. Menu toggling reads the actual native collapse state because native item selection can change it internally.

Theme switching is available in the shell avatar menu on every lab tab. Compact density is the default, with cozy available in Settings. Density preview sets the supported `data-ui5-compact-size` document marker (and the compatibility class), restoring prior ownership on teardown. The browser check compares a native button's height before/after compact selection, rather than checking only application state.
