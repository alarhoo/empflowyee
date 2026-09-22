# FDD — HCM UX Foundation Lab

## Objective
Provide a single developer-facing HCM screen that visually validates the shell, major enterprise layouts, major UI5 control categories, HCM themes and tenant branding before domain features are implemented.

## Users
- empFLOWyee developer / UX reviewer
- not an end-user business feature

## Route
`/ux/theme-lab`

Runtime configuration must allow the route to be disabled, with PROD disabled by default.

## Information architecture

### Shell
Use a real UI5 ShellBar.

Left:
- empFLOWyee logo
- product title / optional tenant name

Right:
- search
- notifications
- profile/avatar/user menu

### Main tabs
Use real UI5 TabContainer.

#### Home
Shows:
- what the lab validates
- currently active base theme and HER mode
- current tenant brand override
- density / locale / direction
- control coverage summary
- contrast/accessibility warnings
- link to Demo and Settings tabs

#### Demo
Uses a real UI5 NavigationLayout with SideNavigation.

Side navigation entries:
- Employee
- Leave
- Projects

All three work areas use FlexibleColumnLayout so list → detail → contextual detail behavior can be tested.

##### Employee
Begin column:
- employee search
- sorting/filter actions
- employee list
- avatars
- status tags

Mid column:
- employee / My Profile detail
- realistic object-page-like composition
- profile header
- forms
- status/actions
- tabs/sections

End column:
- contextual detail such as document, employment event, leave request or project assignment

Employee detail should be the richest demonstration surface.

##### Leave
Use realistic HCM patterns to exercise:
- DatePicker / DateRangePicker / DynamicDateRange
- calendar/legend where appropriate
- request table/list
- status tags
- message strips
- approval timeline
- dialog / responsive popover

##### Projects
Use realistic patterns to exercise:
- Table
- Tree/List
- progress indicators
- rating/proficiency where meaningful
- cards/panels
- toolbar/menu/actions

#### Settings
Interactive playground for themes.

Must support:
- Horizon Light
- Horizon Dark
- HER Light
- HER Dark
- tenant primary color
- density (cozy / compact)
- direction preview (LTR / RTL)
- locale/timezone preview hooks

HER token editor:
- edit semantic tokens, not arbitrary CSS
- update the Demo live without reload
- reset to HER defaults
- show changed token count
- export override JSON
- import override JSON
- validate colors
- display contrast warnings

## Theme behavior

Horizon modes must contain no stale HER overrides.

HER Light:
- base UI5 theme = `sap_horizon`
- apply HER semantic token layer

HER Dark:
- base UI5 theme = `sap_horizon_dark`
- apply HER semantic token layer

Tenant primary color is an additional controlled overlay.

## Functional constraints

- Use real UI5/Fundamental production controls wherever available.
- Do not create HTML/CSS lookalikes.
- Do not use real employee/customer data.
- Demo data is fictional and deterministic.
- Navigation visibility is not authorization.
- Theme Lab does not grant backend access.
