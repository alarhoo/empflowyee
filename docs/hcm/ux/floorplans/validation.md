# HCM floorplan acceptance record

## Current tabbed Object Page revision

The 2026-09-24 revision uses maintained UI5 DynamicPage + TabContainer. Static
object data uses semantic definition lists; editable fields use native Form in
Edit mode with direct FormItem children. This is a supported composition, without
private DOM patches, feature CSS or disabled axe rules. It supersedes the earlier
Core/Platform experiment and its adoption restriction described historically below.

The product owner's [UX direction](../../roadmap/HCM-1-UX-REVISION.md) requires this
object page inside native FlexibleColumnLayout for meaningful list/detail screens.
Each column has its own named native page/header regions. The shared application
boundary supplies column height; features own routes, queries and authorization.

Acceptance passed: 16 Storybook tests; 24 four-theme/viewport cases with zero axe
findings; native collapse/pin, tab keyboard navigation, edit/save, phone overflow,
density changes and in-place theme/tenant-overlay removal. The checker includes
post-edit accessibility and excludes no axe rules. Screenshots were inspected for
phone/desktop readability. See [Role Management validation](../../testing/HCM-1-ROLE-OBJECT-PAGE-VALIDATION.md)
for the live FCL consumer, five browser tests and database/API evidence.
Older results below do not count as verification of this implementation.

### Supported composition limits

The installed UI5 Display Form still separates definition-list semantics across
shadow roots. FormGroup does not propagate Form's Edit accessibility mode to its
nested FormItems in this version. Neither upstream issue is claimed fixed. Use
semantic static content and direct native Edit FormItems as demonstrated by the
shared production example. Exploratory Theme Lab compositions using the affected
patterns are not canonical acceptance evidence. Tabbed sections do not implement
stacked anchor scrolling. Assistive-technology/product-design review remains
additional to automated axe, keyboard, responsive and visual checks.

## Previous implementation evidence (historical)

This record covers the production UX correction on **2026-09-22**. It supersedes the earlier 114-story / 66-case materialization record. Those checks proved that examples rendered; they did not establish native floorplan fidelity or accessibility acceptance. No cloud deployment is part of this correction.

## Native HER palette correction

The earlier emphasis-only mapping was insufficient: native controls retained Horizon surfaces. The corrected public SAP parameter bridge applies the supplied HER palette to native surfaces, fields, tables, text, actions, tabs, default avatars and feedback. Both production floorplans are discoverable in ordinary Storybook without an environment flag.

Focused verification passed: 10 theme unit tests, the two Chromium theme/tenant-branding scenarios, native form surface checks across both floorplans and all four themes, and Storybook rendering of both floorplans with 15 index entries. The application development build and changed-file lint passed. HER source SHA-256 remains unchanged. These checks do not close the existing Object Page accessibility findings below.

## Admission status

| Implementation           | Status                                                 | Evidence and remaining gate                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic Page             | Canonical implementation                               | Maintained UI5 DynamicPage; shared production example; native interaction and theme/viewport checks pass; no axe violations in the 12 content cases.                                                                                         |
| Object Page              | **Review required; not approved for feature adoption** | Maintained Core DynamicPage + Platform IconTabBar composition works, but native tab/form markup has unresolved accessibility findings. Default Storybook discovery includes it under Floorplans / Composed with a visible acceptance notice. |
| Other generated patterns | Deferred                                               | Excluded from discovery. Directory existence does not approve List Report, Worklist, Overview, Analytical List, forms or table adapters.                                                                                                     |

Do not expand the catalog or select Object Page in a feature TDD until its gate is resolved. The application and Storybook render the same library exports and shared example hosts. Review status does not authorize a separate implementation.

## Verified behavior

The affected lint/test/build run covered **30 Nx projects and 55 tasks**. Fifty-four tasks passed in the combined run; `hcm-web:test` hit a worker-start timeout under concurrent load and passed when rerun alone. The focused UX lint/unit checks, production application builds, static Storybook build, architecture checks, tooling lint and all 16 function-documentation policy tests also passed. The 196 affected relative file links were checked, and the ownership Mermaid diagram was rendered and reviewed. The default catalog's seven Dynamic Page stories passed separately after the review-only discovery gate was applied.

- All four themes at **1440 x 960**, **768 x 1024** and **390 x 844**: 24 layout/theme cases for the two proofs, including Amethyst branding and Compact tablet density.
- Native DynamicPage collapse, expand and pin; local directory filtering and reset; native responsive table pop-ins retain lower-priority fields on phones.
- Maintained Object Page section scrolling, selected-section state and arrow-key navigation; Signal Forms lock fields until editing; save/cancel remain in the persistent native toolbar; phone actions use native overflow.
- Storybook toolbar transitions through both HER and Horizon families without reloading the iframe. Removing tenant branding restores the complete baseline inline style set and computed native/semantic tokens.
- Density controls update both Fundamental's maintained density service and UI5's supported Compact class. Browser checks verify that a native input shrinks in Compact and returns to its Cozy height.
- The same application flow passes **12 Playwright checks across Chromium, Firefox and WebKit**: themes, independent branding, fixture navigation and narrow layouts.
- **15 stories in the default configuration** exercise relevant content, loading, empty/missing, recovery, unavailable, permission and read-only behavior, plus local edit actions. They import production examples and contain no replacement layouts.
- The supplied HER SCSS remains unchanged, with SHA-256 `f7718d406bb464a6c4909675fca385da1246a13a2c0cf43d57710111f51b89ac`.

Screenshots were reviewed for native header anatomy, Object Page section spacing and readable phone table pop-ins. Automated accessibility checks supplement visual and keyboard review; they do not replace assistive-technology or final product-design acceptance.

## Object Page accessibility gate

The pinned stack is Fundamental NGX **0.64.3**, UI5 Web Components **2.26.0** and axe-core Playwright **4.13.0**. Each Object Page content case reports these rule families:

| Rule                                             | Rendered source          | Observation                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aria-required-children`, `aria-required-parent` | Platform IconTabBar      | `ul[role=tablist]` contains `li[role=presentation][aria-hidden=false]` around the actual tabs. The global ARIA attribute prevents the presentation wrapper from being treated as transparent by the checker. |
| `definition-list`, `dlitem`                      | UI5 Form in Display mode | Definition lists and their term/definition pairs are separated across Form, FormGroup and FormItem shadow trees and intermediate wrappers.                                                                   |

The interactive filter and employment forms explicitly use `accessibleMode="Edit"`; read-only summary/profile data retain the library's intended Display semantics. Switching every display form to Edit solely to silence checks would misrepresent the component's use. See the [official Form accessibility modes](https://ui5.github.io/webcomponents/components/Form/) and the installed `FormTemplate.js` / `FormItemTemplate.js` for the exact structure.

These findings originate in maintained rendered markup, but still block our acceptance. No axe rules are disabled, no Shadow DOM internals are patched/styled, and no private DOM repair is installed. `verify-workshop.mjs` writes the full findings and exits nonzero while they remain.

Next review must choose a verified upstream correction, a separately reviewed narrow dependency patch, or a supported alternative composition. Reproduce the findings in minimal upstream examples and include assistive-technology checks before resolving the gate. Any exception must be explicit; a green lint/build is not an accessibility waiver.

## Implementation evidence

The two prerequisite inspectors passed before changes. The additional Dynamic Page library was created with the official Nx Angular library generator; the existing Nx Storybook target and Object Page library were corrected in place. The [generator command record](../../../../tools/milestones/hcm-ux-floorplans-storybook/NX-COMMANDS.md) separates initial materialization from this correction.

The Platform DynamicPage proof produced viewport-height wrappers around short stacked sections and large blank gaps. The supported Core DynamicPage + Platform IconTabBar composition removes those wrappers while retaining native header/anchor/scroll behavior. It does not implement a replacement scroll engine. See the [capability evidence](component-capability-matrix.md) and [reuse ADR](../../adr/ADR-0004-floorplan-reuse-first.md).

Theme loading uses identical providers and local assets in both hosts. SAP's relative font paths are preserved. A loaded stylesheet must match the newly requested href; merely finding `link.sheet` can accept an obsolete sheet in Firefox. Tests cover stale sheets, failed loads, discarded root owners, rapid selection changes and bridge cleanup.

The old default HER selection and independent Amethyst toolbar accent obscured theme comparisons; unbranded Horizon is now the default. Horizon also receives the complete semantic alias contract. HER selectors remain scoped, and every transition clears owned inline brand parameters before applying the new selection. The earlier service already cleared its bridge; this correction adds native Angular coordination, root ownership and browser evidence rather than attributing every visual issue to a missing clear operation.

## Repeat validation

From the repository root:

```bash
node tools/ux/check-component-entrypoints.mjs
node tools/ux/check-storybook-readiness.mjs
node tools/milestones/hcm-ux-floorplans-storybook/verify-bundle.mjs
node tools/milestones/hcm-shell-theme-lab/verify-bundle.mjs
pnpm architecture:check
pnpm docs:check
pnpm lint:tooling
pnpm test:lint-policy
pnpm nx affected -t lint test build --base=HEAD --parallel=1
pnpm nx build-storybook hcm-web --configuration=ci
pnpm nx static-storybook hcm-web
```

Keep the static server running, then use another terminal:

```bash
pnpm nx test-storybook hcm-web
pnpm exec playwright test --config apps/hcm/web-e2e/playwright.config.mts --workers=1
```

Use the [verification procedure](../storybook.md#build-and-verify) to run all 15 stories and `verify-workshop.mjs`; both floorplans are discoverable by default. Install Playwright's browsers if absent. `HCM_STORYBOOK_URL` can point the workshop verifier at a running development server instead of port 6006. On Windows plugin-worker startup failures, set `NX_DAEMON=false` and `NX_ISOLATE_PLUGINS=false` in that shell. Use PR base/head SHAs instead of `--base=HEAD` for committed changes. Do not rebuild a static directory during browser verification.

Evidence is written to `.tmp/hcm-workshop/results.json`, `accessibility.json` and per-theme/viewport PNGs. These local artifacts are intentionally untracked. The accessibility exit code remains a release/admission gate, even when functional checks pass.

## Boundaries and limits

The examples have fictional in-memory data, client-side search and disposable edits. They do not implement authentication, authorization, tenant resolution, persistence, server tables, route-leave guards or business transactions. Presentation state is not a security boundary.

Nx product/runtime/domain/type restrictions remain enforced. Floorplans contain no domain feature, API or data-access imports. No other product Storybooks were added. Production bundle budgets were not raised. PR CI builds affected Storybooks; browser acceptance and publication remain explicit follow-up procedures.
