# hcm-web-ux-floorplan-object-page

**Acceptance pending:** installed native tab/form markup has unresolved accessibility findings. This production-code proof is available in Theme Lab and Storybook Review, but is not approved for feature adoption.

HCM floorplan with domain-neutral state/action and content-region contracts. Import from `@empflowyee/hcm-web-ux-floorplan-object-page`. Maintained UI5/Fundamental components own layout and interaction; the consuming feature owns data, permissions and business behavior.

See the [API guide](../../../../../../docs/hcm/ux/floorplans/README.md), [capability evidence](../../../../../../docs/hcm/ux/floorplans/component-capability-matrix.md), [Storybook procedure](../../../../../../docs/hcm/ux/storybook.md) and [validation](../../../../../../docs/hcm/ux/floorplans/validation.md).

Run `pnpm nx lint hcm-web-ux-floorplan-object-page` and `pnpm nx test hcm-web-ux-floorplan-object-page` from the repository root. The shared production example lives in the Theme Lab feature library and is consumed unchanged by Storybook.

## Native composition and consumption

`HcmObjectPage` composes UI5 DynamicPage, DynamicPageTitle/Header, Toolbar and TabContainer through the installed Fundamental Angular wrappers. Header snapping, pinning, action overflow and keyboard tab selection remain native. This replaces the previous Core/Platform stacked section implementation.

Supply `title`, optional `summary`, `actions`, `state`, `readOnly` and `errorMessage`. Action descriptors include a stable `id`, `label`, optional `icon`, `mutates`, `emphasized` and `disabled`. Consume `action`, `retry` and `sectionChange` outputs in the feature. Project header content using `hcmHeader`, with optional `hcmImage` and `hcmKeyInfo` regions.

```html
<ef-hcm-object-page title="Record details" [actions]="actions()" (action)="handleAction($event)">
  <ui5-text hcmHeader>Feature-owned summary</ui5-text>
  <ng-template efHcmObjectSection="details" label="Details">
    <!-- Feature-owned native Form or other content. -->
  </ng-template>
</ef-hcm-object-page>
```

Import both `HcmObjectPage` and `HcmObjectSection` into the consuming standalone Angular component's `imports`. Provide a bounded parent height. Section IDs must be stable and unique. The floorplan contains no employee fixtures, forms, queries or business actions. Theme Lab's `LabProfileComponent` is a consumer, not a second implementation. Sections are tabbed; this pilot does not provide stacked anchor scrolling or router deep links.

For an optional native footer, set `[showFooter]="true"` and project a native Bar carrying `hcmFooter`. The DynamicPage owns footer positioning; the feature owns footer actions and read-only behavior. Non-content states hide the footer. Follow the shared [page and width standard](../../../../../../docs/hcm/ux/page-layout.md).
