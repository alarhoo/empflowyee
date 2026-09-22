# TDD — HCM Shell + Theme Lab Foundation

> Historical initial milestone design. Its schematic preview scope is superseded by the approved [production UX correction](TDD-HCM-UX-FLOORPLANS-STORYBOOK.md). Current Theme Lab renders the same production examples as Storybook.


Status: Approved milestone design; materialized in the workspace on 2026-09-22

## 1. Objective

Create the minimum HCM frontend platform needed before real business features:

- runtime tenant/user context;
- role and entitlement aware application catalog;
- one HCM shell;
- lazy feature composition;
- Horizon/HER theme engine;
- tenant primary-color overlay;
- visual Theme Lab with representative enterprise layouts.

No production authentication/backend bootstrap is implemented in this milestone.

## 2. Runtime boundary

Deployable: `hcm-web`

`apps/hcm/web` remains a thin Angular composition root. It may bootstrap providers/routes/styles and load the shell, but business/UX implementation belongs in Nx libraries.

## 3. Nx projects

| Project                        | Tags                                                       | Responsibility                                                   |
| ------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `hcm-web-runtime-context`      | `product:hcm,runtime:web,domain:identity,type:data-access` | tenant, principal, roles, entitlements, preferences              |
| `hcm-web-navigation-catalog`   | `product:hcm,runtime:web,domain:navigation,type:util`      | Space/Page/Feature catalog and visibility filtering              |
| `hcm-web-ux-theme`             | `product:hcm,runtime:web,domain:ux,type:ui`                | theme state, UI5 theme switching, semantic tokens, brand overlay |
| `hcm-web-shell`                | `product:hcm,runtime:web,domain:shell,type:shell`          | shell chrome, visible Spaces, router outlet                      |
| `hcm-web-ux-feature-theme-lab` | `product:hcm,runtime:web,domain:ux,type:feature`           | lazy visual validation feature                                   |

### Dependency direction

```text
hcm-web (app)
  └── hcm-web-shell
       ├── hcm-web-runtime-context
       ├── hcm-web-navigation-catalog
       └── hcm-web-ux-theme

hcm-web-ux-feature-theme-lab
  ├── hcm-web-runtime-context
  └── hcm-web-ux-theme
```

The Theme Lab feature does not depend on the shell.

## 4. Runtime context

The frontend context model includes:

- tenant identity (`tenantId`, `slug`, `displayName`);
- current principal (`userId`, employee/person display name);
- HCM roles;
- purchased/enabled entitlements;
- tenant presentation defaults;
- optional user presentation overrides.

This fixture will later be hydrated by one authenticated bootstrap endpoint. Do not scatter startup calls across multiple services.

## 5. Catalog model

Hierarchy:

```text
Space
  → Page
      → Group
          → Feature definition
```

A Feature definition includes stable ID, route, owning domain, required roles and required entitlements.

Catalog visibility is presentation-only. API/backend authorization must independently enforce every protected operation.

## 6. Theme resolution

Resolution order:

```text
platform fallback
  ↓
tenant default theme
  ↓
user theme override (optional)
  ↓
tenant primary-color overlay (optional)
```

Supported milestone variants:

- Horizon Light → UI5 `sap_horizon`
- Horizon Dark → UI5 `sap_horizon_dark`
- HER Light → UI5 `sap_horizon` + HER semantic palette
- HER Dark → UI5 `sap_horizon_dark` + HER semantic palette

HER is intentionally not a custom UI5 theme package in this milestone.

## 7. Tenant branding

Tenant onboarding may choose a primary color. The client may only provide the color value, not CSS.

The theme engine:

1. validates six/three-digit hex;
2. normalizes to six-digit hex;
3. derives hover/active/strong and readable foreground colors;
4. writes governed `--ef-*` semantic tokens;
5. bridges only a documented subset of SAP public theme parameters for brand/emphasized controls;
6. can completely clear the overlay and return to the base variant.

Arbitrary tenant CSS, font injection, custom JS, and deep shadow-DOM styling are prohibited.

## 8. Signal strategy

Angular Signals are the default state model. Stores expose readonly signals/computed values and explicit mutation methods.

RxJS remains allowed where stream semantics are genuinely useful; it is not required for static runtime context in this milestone.

## 9. Theme Lab

Route: `/ux/theme-lab`

Capabilities:

- choose one of the four theme variants;
- set/clear tenant primary color;
- show current tenant/principal/roles;
- select one of four schematic previews:
  - Overview/launchpad;
  - Object Page;
  - Flexible Columns;
  - Table + Form;
- include real wrapped UI5 buttons/inputs inside previews to validate base UI5 theming alongside empFLOWyee surfaces.

The floorplan previews are not production floorplan libraries.

## 10. UI5 initialization

Before Angular bootstrap:

- import core and Fiori Assets;
- configure UI5 to ignore `ef-` Angular element prefixes;
- theme service uses UI5 `setTheme`.

Use Fundamental NGX secondary entry points to avoid pulling the full wrapper barrel.

## 11. Security constraints

- Catalog filtering is not authorization.
- Tenant slug from hostname is not authorization.
- No bearer tokens, credentials, or secrets are persisted in this fixture.
- Primary color input is parsed as a color value only; never interpolate raw values into arbitrary style text.

## 12. Acceptance criteria

See `CODEX-IMPLEMENTATION-PROMPT.md`.

## 13. Materialization record

The five project names/tags in section 3 are implemented at the paths in the
[maintainer guide](../architecture/shell/README.md#library-map), using imports
`@empflowyee/<project-name>`. Nx 23.2.1 generated every project's metadata,
tsconfigs, aliases, lint configuration and unit-test setup. Inspected versions:
Angular 22.1.7, Fundamental NGX wrappers 0.64.3 and UI5 Web Components 2.26.0.

Workspace adaptations:

- Non-buildable libraries retain the existing `vitest-analog` default. Nx documents
  `vitest-angular` as requiring buildable/publishable libraries. Generation installed
  the missing Analog/Vite test dependencies; it did not change Angular or UI5 versions.
- Generation explicitly used `--prefix=ef-hcm`, `--linter=eslint`,
  `--unitTestRunner=vitest-analog` and `--skipFormat=true`. Later calls used
  `--skipPackageJson=true` after the first installed the common dependencies.
  `--routing=true` was used for Theme Lab. Generated placeholder components/routes
  were replaced with adapted milestone source, without replacing project metadata.
- Four short foundation names differ from the platform naming pattern. They are
  recorded as scoped exceptions in the [taxonomy](../../platform/engineering/nx/project-taxonomy.md#hcm-foundation-names).
  All existing type/product/runtime dependency rules remain enforced.
- The template catalog imported runtime-store types despite its `type:util` role.
  Catalog requirements now use stable string identifiers and receive effective sets
  from the shell; there is no utility-to-data-access dependency.
- The app keeps its existing public runtime-config bootstrap and Zone.js configuration.
  Core/Fiori assets initialize before bootstrap; no auth or API client was added.
- Theme Lab writes user preference/tenant accent changes through the fixture store.
  The shell resolves them into the independent theme service. This prevents later
  session edits from overwriting a selected preference.
- Native theme asset changes are serialized, stale selections are skipped, and
  asset failures are surfaced. Clearing removes every bridge-owned inline parameter.
- Contrast uses WCAG relative luminance, chooses the better black/white foreground,
  and preserves at least 4.5:1 for tenant accent normal/hover/active text. Strong accent
  text is independently adjusted against the current surface. The supplied HER
  palette itself is byte-for-byte unchanged.
- Branding input uses Signal Forms. Read-only UI5 inputs in previews are fixtures,
  not an exception introducing Reactive Forms. Role/entitlement toggles are explicit
  in-memory commands.
- Four preview components live inside the Theme Lab feature, keeping component styles
  within existing budgets. They are not reusable production floorplans or new Nx types.
- Catalog entries without an implemented route are visibly Planned. Theme Lab remains
  directly reachable when its navigation role is removed so the fixture can be reset;
  no claim of authorization is made by the UI.

See the [verified generator options](../../../tools/milestones/hcm-shell-theme-lab/NX-COMMANDS.md)
and the [local verification procedure](../architecture/shell/README.md#validate-a-change).
Completed checks and scope limits are recorded in the [validation record](../architecture/shell/validation.md).

## 14. Preview scope and states

| Preview          | Existing specification         | Current fixture behavior                                                    |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------- |
| Overview         | UX-FP-OVERVIEW                 | Static tiles; business launches deferred                                    |
| Object Page      | UX-FP-OBJECT-PAGE              | Read-only profile sections and route-preserving anchors                     |
| Flexible Columns | UX-FP-FLEXIBLE-COLUMN          | Three schematic columns; two at tablet size, stacked on narrow screens      |
| Table + Form     | UX-FP-LIST-REPORT / UX-FP-FORM | Semantic table with contained horizontal scrolling and a read-only UI5 form |

No asynchronous business operation runs, so loading/backend-error states are not
simulated as implemented product behavior. Theme asset errors and invalid accent
input have visible messages. An empty visible catalog has an explicit empty state.
Business edit/submit actions are disabled. Authentication/permission-denied screens,
production table behavior and real responsive FCL navigation remain the next
floorplan milestone, governed by the existing capability matrix and FDD/TDD process.
