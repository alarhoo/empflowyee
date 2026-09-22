# Acceptance criteria

## Shell
- Real UI5 ShellBar used.
- Brand on left, profile/user affordance on right.
- Shell remains visually correct in all four themes.

## Main tabs
- Real UI5 TabContainer used.
- Home, Demo, Settings work without page reload.

## Demo
- Real UI5 NavigationLayout used unless a documented blocker is found.
- Real UI5 SideNavigation used.
- Employee, Leave and Projects each render inside FlexibleColumnLayout.
- Employee selection opens profile in the middle column.
- A contextual sub-object can open in the end column.
- Responsive behavior uses FCL/NavLayout APIs, not manual CSS column emulation.

## Native controls
- No custom HTML/CSS imitation exists for a UI5 component that is available.
- Forms use UI5 Form.
- Tables use the modern UI5 Table.
- Timeline uses UI5 Timeline.
- Upload demo uses UI5 FileUploader/UploadCollection as appropriate.
- dialogs/popovers/messages use UI5 components.

## Themes
- Horizon Light works.
- Horizon Dark works.
- HER Light works.
- HER Dark works.
- no "theme assets could not be loaded" warning.
- switching HER -> Horizon removes HER-specific visual tokens.
- switching Horizon -> HER reapplies HER defaults.
- tenant primary color can be toggled independently.

## Settings
- token edits apply immediately.
- invalid colors do not corrupt the page.
- reset restores checked-in HER defaults.
- export JSON works.
- import JSON validates schema/version.
- contrast warning is shown for obviously unsafe foreground/background combinations.

## Architecture
- lab is lazy-loaded.
- no new deployable app created.
- mock data only.
- PROD route disabled by runtime configuration by default.
- Nx boundaries remain intact.

## Visual quality
- no placeholder-looking grey rectangles used where native controls exist.
- spacing/density is deliberate and consistent.
- the Employee detail should be credible as the future My Profile UX, not a component dump.

## Implementation verification — 22 September 2026

The Foundation Lab v2 implementation has the native shell, three main tabs, Employee/Leave/Projects FCL flows and semantic workshop described in the [maintainer guide](README.md).

| Check | Result and evidence |
| --- | --- |
| Affected Nx targets | Lint and tests passed for HCM web, runtime context, theme, feature lab and shared runtime shell; HCM production build passed |
| Theme contract | Unit checks cover all variants, asynchronous loading/failure, HER cleanup, tenant accents, invalid token imports and independent reset |
| Browser workflows | Chromium checks passed for profile edit/save, Employee/Leave/Projects selection, native FCL middle/end columns and disabled runtime routes |
| Native theme colors | Browser checks inspect actual native Form backgrounds in HER Light/Dark and verify all owned inline parameters are released on unbranded Horizon |
| Workshop | Valid/invalid JSON imports, contrast warning, reset, JSON download, native compact button geometry and RTL preview passed |
| Responsive | Native FCL reviewed at 1440px, 768px and 390px; mobile navigation slides outside the viewport, leaving the profile usable |
| Runtime generation | Existing Angular container image ran the current entrypoint with the flag omitted, true, false and invalid; generated JSON/default behavior and invalid-value rejection passed |
| Architecture/documentation | Architecture and documentation verifiers passed; changed local documentation file links were checked; new diagrams use the actual route/component/theme relationships |
| Supplied HER palette | Existing HER SCSS remains unchanged; SHA-256 `f7718d406bb464a6c4909675fca385da1246a13a2c0cf43d57710111f51b89ac` |

Visual inspection prompted corrections beyond build assertions: native tab/switch/slider accent parameters, custom-item initialization in initially hidden tabs, and NavigationLayout's resize integration. Theme parameter values are read together before writes to avoid repeated document style recalculation.

### Limits and next approval

- The current pilot production build passes at **449.90 kB** initial size (118.23 kB estimated transfer), below the existing **500 kB warning threshold**. The earlier 625.40 kB result predates the native floorplan refactor; budgets were not weakened.
- Verification used desktop Chromium with responsive viewports. Firefox/WebKit, physical touch devices and a complete screen-reader/keyboard accessibility audit are not claimed.
- Human visual approval is still required before freezing the HER palette or adopting a pilot in a business feature. Object Page and ToolPageLayout already reside in reusable libraries; Theme Lab consumes them for review. Library placement does not automatically approve business-screen adoption.
- No backend integration, production employee editing, uploads, authentication, persistence or deployment is included. Storybook now includes the shared ToolPageLayout and retains the shared Object Page consumer.

### Reusable pilot correction

The page-layout follow-up also passes HTML formatting, native page-structure policy tests, strict Angular template compilation, HCM lint/build and focused Chromium flows. The shared centered canvas was checked at 2560, 1440, 768 and 390px: maximum 1440px at the default font size, equal outer margins, no document overflow. Page headers are required by the PR check; optional Object Page footers use the native DynamicPage slot. VS Code formatter settings are tracked so new checkouts receive the same HTML formatting behavior.

Object Page and ToolPageLayout are implemented in `libs/hcm/web/ux/floorplans` and consumed by the lab. Focused library lint/unit checks, HCM production build, Storybook build, architecture and documentation verification passed. Chromium checks passed for employee edit/save, native navigation/FCL, workshop import/reset, default compact density and cozy switching. The avatar menu switches all four themes while the selected employee remains open; native Form surfaces receive HER colors, and Horizon releases HER overrides. Screenshots cover desktop, tablet and phone widths (1440/768/390px). This is focused pilot verification, not complete accessibility certification.
