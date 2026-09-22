You are implementing the HCM UX Foundation Lab in the empFLOWyee Nx monorepo.

Act as a senior Angular/UI5 engineer. The goal is a production-quality developer UX lab, not another mock component gallery.

READ FIRST:
- AGENTS.md
- docs/hcm/fdd/FDD-HCM-UX-FOUNDATION-LAB.md
- docs/hcm/tdd/TDD-HCM-UX-FOUNDATION-LAB.md
- docs/hcm/adr/ADR-HCM-UX-FOUNDATION-LAB-v2.md
- docs/hcm/ux/theme-lab/THEME-TOKENS.md
- docs/hcm/ux/theme-lab/CONTROL-COVERAGE.md
- docs/hcm/ux/theme-lab/ACCEPTANCE-CRITERIA.md
- docs/hcm/ux/theme-lab/DEMO-DATA.md
- reference/her-theme/_hcm-theme-her.scss

IMPORTANT ARCHITECTURE CORRECTION:
Do not continue the earlier fake/custom Theme Lab floorplans. Replace approximations with real UI5/Fundamental components.

Use current official UI5 Web Components documentation to select controls. You do NOT need to start with a package-inventory exercise. The TDD already defines the intended control strategy. At implementation time, verify that the repository's package version exposes each selected import. If a documented current control is missing because the repo is behind, propose/perform an aligned dependency upgrade rather than writing an imitation.

PRIMARY UX STRUCTURE:

ShellBar
└── TabContainer
    ├── Home
    ├── Demo
    │   └── NavigationLayout
    │       ├── SideNavigation
    │       │   ├── Employee
    │       │   ├── Leave
    │       │   └── Projects
    │       └── FlexibleColumnLayout
    └── Settings

Implement a reusable ToolPageLayout under `libs/hcm/web/ux/floorplans/tool-page-layout` using native NavigationLayout for header + side navigation + content. Implement Object Page in the sibling `object-page` library using native DynamicPage and TabContainer. Theme Lab consumes these two pilots; it owns fixtures, not floorplan implementations. Thin empFLOWyee naming wrappers are allowed, but must preserve native behavior. Theme selection belongs in the avatar menu; compact density is the default.

IMPLEMENTATION ORDER

1. CLEANUP / ROUTING
- Locate the current Theme Lab route and implementation.
- Preserve useful theme services/fixtures only if they fit this TDD.
- Remove/rewrite custom Fiori lookalikes.
- Keep `/ux/theme-lab` lazy-loaded.
- Ensure runtime config can disable the lab in PROD by default.

2. THEME ASSETS FIRST
- Ensure UI5 main and Fiori Assets are imported so Horizon Dark and other non-default theme assets load correctly.
- Eliminate the existing "Theme assets could not be loaded" warning.
- Verify base theme switching before building the demo.

3. THEME ENGINE
Implement exact variants:
- horizon-light -> sap_horizon + NO HER overrides
- horizon-dark -> sap_horizon_dark + NO HER overrides
- her-light -> sap_horizon + HER light semantic tokens
- her-dark -> sap_horizon_dark + HER dark semantic tokens

Switching to Horizon must remove HER dataset attributes and runtime token overrides.

Tenant primary-color override is independent from HER family and must be resettable.

Use the supplied HER SCSS as the checked-in defaults. Do not rewrite its palette casually.

4. SHELL
Use real UI5 ShellBar.
- left: empFLOWyee brand/logo + title
- right: search, notifications, avatar/profile/user menu
- mock interactions are fine, but use actual UI5 controls

Below/within the shell feature, use real UI5 TabContainer for Home / Demo / Settings.

5. HOME TAB
Build a useful developer landing page using real UI5 controls.
Show:
- active theme
- base UI5 theme
- tenant accent status
- density
- direction/locale preview
- control coverage progress
- concise explanation of the lab
- current warnings (contrast/theme load)

This page should look like a real product page, not a component dump.

6. DEMO TAB
Use real UI5 NavigationLayout with SideNavigation.
Navigation items:
- Employee
- Leave
- Projects

Each area uses real UI5 FlexibleColumnLayout.

EMPLOYEE AREA
Begin column:
- toolbar/search/filter affordances
- employee list with Avatar, name, title, email, employee ID, employment type/status tags
- realistic selection state

Mid column:
- My Profile / Employee detail
- credible future production layout
- use DynamicPage/Page and supported native primitives
- header: Avatar, name, role, office/department/manager/joined-on, actions
- section navigation using supported native control (TabContainer is acceptable)

Sections should exercise real controls in realistic HCM context:

Basic Details
- UI5 Form / FormGroup / FormItem
- Label/Text in display mode
- Input/Select/ComboBox/DatePicker/etc in edit demo
- buttons/actions

Verification / Extended Profile
- Switch/CheckBox/RadioButton
- MultiInput/Tokenizer/Token
- MessageStrip

Skills & Competencies
- RatingIndicator
- ProgressIndicator
- Table/List

Leave
- Table
- DateRangePicker / DynamicDateRange
- Tag statuses
- dialogs/popovers for request/detail

Employment History
- Timeline

Documents
- FileUploader / UploadCollection
- IllustratedMessage empty state when appropriate

Projects
- Table/Cards/ProgressIndicator

End column:
- selected leave request, document, employment event, or project assignment
- use Page/DynamicPage or another supported native container

LEAVE AREA
Use realistic leave self-service/manager patterns to exercise:
- DateRangePicker
- DynamicDateRange
- Calendar / CalendarLegend where useful
- Table/List
- Tag
- Timeline
- SegmentedButton
- ViewSettingsDialog
- IllustratedMessage

PROJECTS AREA
Use realistic project/assignment patterns to exercise:
- Table
- Tree or List
- Card/Panel
- ProgressIndicator
- RatingIndicator if meaningful
- Toolbar/Menu

Do not force controls into nonsense scenarios just to increase coverage.

7. SETTINGS TAB
This is the live HER theme workshop.

Use real UI5 controls to edit theme values.

Sections:
- Theme preset
- Tenant branding
- Accent/brand tokens
- Text tokens
- Surface tokens
- Border/focus tokens
- Semantic status tokens
- Radius/shadow tokens
- Density/direction/locale previews

Capabilities:
- live update without reload
- reset to checked-in HER defaults
- reset tenant override
- show changed token count
- export JSON
- import validated JSON
- invalid colors rejected
- contrast warning for unsafe combinations

Do NOT provide arbitrary CSS textarea/editing.

8. RESPONSIVE BEHAVIOR
Test desktop/tablet/phone manually.
Use NavigationLayout/FCL native responsive APIs.
Do not emulate FCL with CSS grid.

9. CONTROL QUALITY
The lab should use broad major enterprise UI5 coverage, but not literally force every niche UI5 component into the page.
Use `CONTROL-COVERAGE.md` as the required list and document omissions with rationale.

10. TESTS
Add tests for at least:
- theme variant resolution
- HER -> Horizon cleanup
- tenant override apply/reset
- token import validation
- route runtime gating
- employee selection -> FCL detail
- demo side-navigation switching

11. VALIDATION
Run the appropriate Nx lint/test/build for affected projects.
Do not weaken Nx module boundaries.

12. DOCUMENTATION
Update the TDD only where implementation reality differs.
Do not create Storybook work in this task.

DEFINITION OF DONE
The lab must look credible enough that the Employee detail could become the starting point of the real My Profile application. Native UI5 controls must visibly retain their correct behavior across Horizon Light/Dark and HER Light/Dark. There must be no fake Fiori floorplans and no HER leakage into Horizon modes.
