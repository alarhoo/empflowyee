# HCM production floorplans

Use the [capability matrix](component-capability-matrix.md) and [selection standard](../../../platform/ux/floorplans/selection-standard.md) before implementing a feature. A platform catalog ID describes intent; only a reviewed HCM implementation may be selected in a feature TDD.

The current proof covers two floorplans. Other generated libraries are deferred and are not canonical production recommendations.

## Dynamic Page

Import `HcmDynamicPage` from `@empflowyee/hcm-web-ux-floorplan-dynamic-page`. It uses the maintained UI5 Angular DynamicPage, title and header directly. UI5 owns snapping, pinning, responsive padding, scrolling and action overflow.

Use it for persistent title/actions with collapsible contextual information. Prefer native Page for simple bounded content that does not need these behaviors.

Inputs: required `title`, `summary`, `state`, `readOnly`, `actions`, `errorMessage`, `showFooter`. Outputs: `action` (stable action ID), `retry`. Regions: `[hcmHeader]`, default content and `[hcmFooter]`. The consumer supplies a bounded canvas height.

The HCM responsibility is the action/state contract, not an API alias. Action descriptors contain `id`, `label`, optional `mutates`, `emphasized` and `disabled`. Read-only omits mutations while preserving informational/navigation actions. The consuming feature owns any projected footer and its editability.

## Object Page

**Review required:** native tab/form accessibility findings prevent feature adoption. See the [acceptance gate](validation.md#object-page-accessibility-gate).

Import `HcmObjectPage` and `HcmObjectSection` from `@empflowyee/hcm-web-ux-floorplan-object-page`.

The implementation composes Fundamental Core DynamicPage with Platform Icon Tab Bar in stacked mode. The Platform DynamicPage proof was rejected because its intermediate DynamicPageContent wrappers force each short section to fill a viewport, creating large blank gaps. Using the supported underlying components removes those wrappers without custom scrolling, private APIs or CSS overrides. There is no installed Angular export literally called ObjectPage. Platform already provides object title/image/key-info regions and section scrolling; the HCM composition projects stable labeled sections and owns the presentation-state/action contract.

Use it for one object with grouped information and object-level actions. Do not use it for a collection, wizard or list-detail navigation.

Inputs: required `title`, `summary`, `state`, `readOnly`, `actions`, `errorMessage`. Outputs: `action`, `retry`, `sectionChange`. Regions: `[hcmImage]`, `[hcmKeyInfo]`, `[hcmHeader]` and labeled templates:

```html
<ng-template efHcmObjectSection="employment" label="Employment">
	<!-- Feature-owned production form or display content. -->
</ng-template>
```

Section IDs must be unique within the page and stable across updates. Native Platform code owns selection, scroll positioning and active-section tracking. Feature routing/deep-link integration is not implemented by this floorplan.

## State and security ownership

Both floorplans distinguish content, loading, empty, error/retry, denied and unavailable. Empty means no directory results for Dynamic Page and a missing object for Object Page. Read-only is independent of the content state.

Floorplans make no requests and do not authorize data access. Hidden projected Angular content can still be instantiated; features must gate requests and sensitive data before projection. Do not treat view state as a security control.

The sample Employee Directory and Employee Profile live in the Theme Lab feature and are rendered unchanged by Storybook. Profile edits affect disposable in-memory data only.

## Verification

See the [validation record](validation.md) and [Storybook procedure](../storybook.md). Approval requires native interaction, theme-isolation, responsive and accessibility evidence; a successful build alone is insufficient.
