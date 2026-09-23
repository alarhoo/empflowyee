# HCM-0 catalogue launchpad design

Approved scope: the current HCM-0 launchpad and local-session request. No business
application, database table or folder materialization is included. The launchpad is
a dedicated navigation-owned Nx feature, generated with the installed Angular generator.
The local trust boundary follows [the local session ADR](../adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md).

## Ownership

- `hcm-runtime-contract`: typed generated projection of the three canonical JSON
  files plus the additive local-session presentation contract. A checked generator
  prevents manually maintained runtime metadata from becoming a second authority.
  Its separate `/catalogue` entry point keeps inventory data out of eager session
  validation; the async route guard loads catalogue policy only when needed.
- `hcm-web-navigation-catalog`: pure catalogue projection, discovery filtering,
  implementation/route access and title/code/domain/page/group search.
- Existing API runtime roles: server persona adapter, exact tenant resolution and
  unchanged application policy. Local launcher activates it explicitly.
- `hcm-web-runtime-context`: normal API bootstrap, persona selection and shared
  application-navigation intents (global search, inspection and app opening).
- `hcm-web-shell`: global ShellBar, search input, identity/persona menu, appearance
  menu and runtime status; it does not import the launchpad feature.
- `hcm-web-navigation-feature-launchpad`: lazy root screen, local Space/Page
  selection, native navigation, tile groups, results and the shared unavailable dialog.
- `apps/hcm/web`: existing thin composition root and lazy route imports only.

## Native UI evidence and composition

Floorplan: `UX-FP-STANDARD-PAGE`, NATIVE. Installed Fundamental NGX wrappers expose
`Page`, `ShellBar`, `ShellBarBranding`, `Bar`, `Title`, `Input`, `TabContainer`, `Tab`, `Dialog`, `Select`,
`Option`, `Button` and `CheckBox`. ShellBar supports searchField/profile slots.
Core `TileComponent` supplies keyboard activation and `tileClick`;
`TileContainerDirective` supplies native wrapping in its default mode (list mode
is vertical). Set the tile button role explicitly. Use maintained
tile header/title/subtitle/footer directives. Consume these directly. No custom
tile control is needed. The presentation skin below supplies the approved shared layout styling. Keep the existing global theme service and the
single application canvas. Theme preferences are selected through the same service.

Hierarchy: shell chrome → Space tabs → selected native content Page with header →
Page tabs → named groups → maintained tiles. Search uses the same tile component
inside a page-backed results view, deduplicated by app code. An anchored profile Popover owns identity and server-advertised development
persona/inspection controls; the separate ShellBar theme action owns appearance selection.
These are private shell and navigation-feature compositions, not a new reusable floorplan API.

## Metadata and states

All 170 canonical apps currently remain Planned, including MY_PROFILE: there is no
valid domain implementation or approved route in this checkout. Preserve null
route/floorplan values. Add the three catalogue-only personal apps to the existing
Employee Information and Service group so every app is inspectable through pages.

Normal mode applies explicit discovery permissions/entitlements and role-assigned
Space placement. Inspection, advertised only by a local session, exposes every
canonical Space/Page/Group. Neither mode changes implementation status or route
access. Available requires complete implementation, an approved route and normal
capability checks. Planned/unavailable selection opens one dialog and never
generates or loads a business placeholder. Foundation preview routes stay separate
from the business inventory and retain their existing access policy.

Use Signals for search, Space/Page selection, inspection and dialog state. On
persona changes clear inspection/search and choose a permitted selection; refresh
the normal API contract and return home so a previously loaded feature is not
retained under different access. Preserve loading/error/unknown/suspended states
and the production authentication-required fallback when local mode is absent.

## Validation

Catalogue coverage/generation checks, policy/search unit tests, API boundary tests,
runtime facade tests and live local browser tests cover personas, all five Spaces,
20 Pages, all 170 apps, search, shared planned behavior and route denial. Inspect
desktop/mobile, keyboard behavior, all four themes and tenant-overlay removal.
Run affected Nx lint/test/build, tooling lint, format, docs, architecture and page
structure checks. No new business app is made available to satisfy a test.

## Launchpad visual refinement

The approved visual refinement adapts the supplied reference styling and landscape
assets without copying reference HTML, navigation logic or business implementations.
This explicitly supersedes the initial unstyled tile-container presentation above.
The shell retains native UI5 Space/Page tabs, Page, ShellBar, Popover and Fundamental
tiles. The Page header uses native Space tabs; its current-page heading and canonical
description are in the content introduction. Page navigation uses native overflow.

The shared UX foundation owns `_hcm-launchpad.scss`. Native TileContainer does not
supply the requested landscape, glass surfaces or fluid separated tile grid. This
scoped exception allows background assets, responsive layout and tile surface styling
on owned classes and public native CSS parts. Use SAP/empFLOWyee semantic parameters,
with reference glass highlights/shadows owned only by the global skin; no private
Shadow DOM selectors or per-theme feature styles.
Keep native interaction, keyboard focus and reduced-motion behavior. The existing
90rem limit applies to content, not the application root. ShellBar, the Space-bar
surface and the landscape span the viewport. The lazy route advertises full-bleed
layout, frames its own content once, and aligns Space labels with that frame.
Other routes retain the shared shell content frame; nested pages do not add another.
Tiles use the reference 58% surface, translucent highlight, blur/saturation and
borderless shadow. Group headings stay transparent. Global HCM scrollbars use
a thin translucent thumb and transparent track, including native scroll containers.

The profile action opens an anchored native Popover containing server-provided name,
optional email, tenant, a canonical My Profile action and development persona/inspection
preferences. No account details are fabricated in browser components. Development
email addresses use the reserved `dundermifflin.example` domain in the server adapter.
The runtime DTO adds optional `user.email` without breaking existing providers.

A native ShellBarItem immediately before the avatar opens a native radio menu with
Horizon Light, Horizon Dark, HER Light, HER Dark and Follow device. The existing
global theme engine remains the only theme implementation. `HcmAppearanceService`
validates and persists the full variant or `system` at `empflowyee.hcm.appearance`.
Locked tenant policy wins. Otherwise a local variant wins over an explicit server
user theme; with neither, follow the device within the tenant family. Explicit
Follow device resumes live device updates within the server-selected family.
Legacy light/dark values continue to resolve within that family. Storage failures
retain the in-memory choice; no credentials or capabilities are persisted.

The native loader awaits UI5 startup before selecting the saved native base. This
prevents an initial light-palette load from overwriting a dark preference after the
lazy screen is created. Browser validation checks rendered foreground/surface colors
as well as the selected variant marker. HER bridges tile and navigation parameters
through the same global semantic palette.

Validate the real production shell in all four themes, both device schemes, reload
persistence, persona switching, keyboard/outside-click popup dismissal, mobile
widths, reduced motion, catalogue coverage and axe accessibility.
