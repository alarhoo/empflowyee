# HCM UX production foundation

Status: implementation design approved on 2026-09-22 following the capability audit. This replaces the earlier nine-floorplan materialization design.

## Scope and ownership

Prove only `UX-FP-DYNAMIC-PAGE` and `UX-FP-OBJECT-PAGE`. Storybook is the curated production catalog; Theme Lab is its exploratory application consumer. Neither has a separate floorplan implementation. Fictional examples live in the Theme Lab feature library and project business-shaped content into domain-agnostic floorplans. Story files supply inputs and interaction assertions only.

Floorplans retain `product:hcm`, `runtime:web`, `domain:ux`, `type:floorplan`. They cannot import features, business domains, data access, APIs or another floorplan. No Nx boundary is weakened.

## Dynamic Page

Use `DynamicPage`, `DynamicPageTitle` and `DynamicPageHeader` from the installed Fundamental UI5 Fiori wrappers. Native code owns snapping, pinning and scrolling. The empFLOWyee composition owns accessible title presentation, explicit view states and actions whose mutation semantics can be suppressed independently from read-only actions. Projected header/body/footer content remains feature-owned. The component does not fetch data or decide permission.

## Object Page

The Platform DynamicPage proof exposed viewport-height content wrappers that leave large gaps between short sections. Use `@fundamental-ngx/core/dynamic-page` with `@fundamental-ngx/platform/icon-tab-bar`, `stackContent=true`, maintained title/header/action components and naturally sized projected sections. Platform Icon Tab Bar already supplies stacked section scrolling and active-section tracking. Do not implement a competing anchor/scroll engine. Stable section IDs and template projection belong to the empFLOWyee contract. Native section navigation must be proved at desktop/tablet/phone sizes before acceptance.

## Theme and assets

One production theme service coordinates native UI5 and Fundamental assets, HER semantic tokens and the controlled tenant accent. App and Storybook serve the same local fonts/theme assets. Default is Horizon Light with no tenant override. Requested and successfully applied themes are separate observable states; loading failures must be visible. Teardown removes owned document attributes and inline overrides. HER source palette is preserved.

## Acceptance

- Both developer surfaces render the same production implementations and example hosts.
- Native header collapse/pinning, section navigation, scrolling and action behavior work without imitation CSS.
- Read-only preserves non-mutating actions; loading/empty/error/unavailable/permission states remain distinct.
- Verify all four themes at desktop/tablet/phone widths and brand application/removal without reload.
- Verify keyboard focus, accessible names/headings, announcements and overflow; record accessibility limits honestly.
- Keep business behavior, requests and authorization decisions in consuming features.
- The remaining floorplans/patterns stay deferred; story counts are not an acceptance criterion.

See the [capability matrix](../ux/floorplans/component-capability-matrix.md), [Storybook guide](../ux/storybook.md) and [validation record](../ux/floorplans/validation.md).
