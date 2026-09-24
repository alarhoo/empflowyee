# HCM production floorplans

Use the [capability matrix](component-capability-matrix.md) and [selection standard](../../../platform/ux/floorplans/selection-standard.md) before implementing a feature. A platform catalog ID describes intent; only a reviewed HCM implementation may be selected in a feature TDD.

Dynamic Page and the tabbed Object Page are accepted compositions. ToolPageLayout remains a Theme Lab pilot. Other generated libraries are deferred and are not canonical production recommendations.

## Dynamic Page

Import `HcmDynamicPage` from `@empflowyee/hcm-web-ux-floorplan-dynamic-page`. It uses the maintained UI5 Angular DynamicPage, title and header directly. UI5 owns snapping, pinning, responsive padding, scrolling and action overflow.

Use it for persistent title/actions with collapsible contextual information. Prefer native Page for simple bounded content that does not need these behaviors.

Inputs: required `title`, `summary`, `state`, `readOnly`, `actions`, `errorMessage`, `showFooter`. Outputs: `action` (stable action ID), `retry`. Regions: `[hcmHeader]`, default content and `[hcmFooter]`. The consumer supplies a bounded canvas height.

The HCM responsibility is the action/state contract, not an API alias. Action descriptors contain `id`, `label`, optional `mutates`, `emphasized` and `disabled`. Read-only omits mutations while preserving informational/navigation actions. The consuming feature owns any projected footer and its editability.

## Object Page

The tabbed UI5 composition passes the current [acceptance checks](validation.md#current-tabbed-object-page-revision). Use semantic static content and direct native Edit FormItems; the documented Display Form/FormGroup limitations remain.

Import `HcmObjectPage` and `HcmObjectSection` from `@empflowyee/hcm-web-ux-floorplan-object-page`.

The implementation composes the installed UI5 DynamicPage, DynamicPageTitle, DynamicPageHeader, Toolbar and TabContainer Angular wrappers. Native components own header snapping/pinning, action overflow and keyboard tab navigation. This replaces the earlier Core/Platform stacked section experiment; it does not claim that the Angular ecosystem lacks composition capabilities.

Use it for one object with grouped information and object-level actions. Use it as the detail page inside native FlexibleColumnLayout for list/detail navigation. The collection belongs in the begin column; wizards require a dedicated route.

Inputs: required `title`, `summary`, `state`, `readOnly`, `actions`, `errorMessage`, `showFooter`. Outputs: `action`, `retry`, `sectionChange`. Regions: `[hcmImage]`, `[hcmKeyInfo]`, `[hcmHeader]`, optional `[hcmFooter]` and labeled templates. Native footer display requires `showFooter` and the content state; features own its actions. All consumers follow the shared [page and width standard](../page-layout.md):

```html
<ng-template efHcmObjectSection="employment" label="Employment">
	<!-- Feature-owned production form or display content. -->
</ng-template>
```

Section IDs must be unique within the page and stable across updates. Native UI5 TabContainer owns section selection, keyboard navigation and tab overflow. Sections use tabbed content, not stacked anchor scrolling. Feature routing/deep-link integration is not implemented by this floorplan.

## ToolPageLayout

**Floorplan ID:** `UX-FP-TOOL-PAGE`; **HCM implementation:** NATIVE through an empFLOWyee naming integration. Object Page remains `UX-FP-OBJECT-PAGE`, COMPOSED.

Import `HcmToolPageLayout` from `@empflowyee/hcm-web-ux-floorplan-tool-page-layout`. This is a thin integration of native UI5 NavigationLayout with the empFLOWyee name. Use for a workspace with a header, side navigation and a Page or FlexibleColumnLayout body. Do not use it as a replacement for native Page, FCL, Form or Table.

Project a native header element with `slot="header"`, native SideNavigation with `slot="sideContent"`, and default content. Supply a bounded parent height. `mode` supports native `Auto`, `Expanded` and `Collapsed` values and two-way binding. `toggleNavigation()` reads the current native state; `resetNavigation()` returns to Auto. Viewport changes refresh native responsive state. Business routing, permissions and navigation items belong to the consumer.

See the [library usage example](../../../../libs/hcm/web/ux/floorplans/tool-page-layout/README.md).

## State and security ownership

Dynamic Page and Object Page distinguish content, loading, empty, error/retry, denied and unavailable. Empty means no directory results for Dynamic Page and a missing object for Object Page. Read-only is independent of the content state.

Floorplans make no requests and do not authorize data access. Hidden projected Angular content can still be instantiated; features must gate requests and sensitive data before projection. Do not treat view state as a security control.

The sample Employee Directory and Employee Profile live in the Theme Lab feature and are rendered unchanged by Storybook. Profile edits affect disposable in-memory data only.

## Verification

See the [validation record](validation.md) and [Storybook procedure](../storybook.md). Approval requires native interaction, theme-isolation, responsive and accessibility evidence; a successful build alone is insufficient.
