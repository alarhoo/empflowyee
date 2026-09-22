# HCM ToolPageLayout

Reusable pilot: `@empflowyee/hcm-web-ux-floorplan-tool-page-layout`.

`HcmToolPageLayout` uses the maintained Fundamental Angular `NavigationLayout` wrapper (`@fundamental-ngx/ui5-webcomponents-fiori/navigation-layout`). Native UI5 owns panel layout, phone dismissal and responsive navigation. The integration adds an empFLOWyee name and refreshes the native Auto state on viewport resize. It contains no fixture data, application routing or business-domain dependencies.

## Usage

Import `HcmToolPageLayout`, native `Bar`, `Button`, `SideNavigation`/items and the chosen content component into the consuming standalone Angular component. Give the parent a bounded height.

```html
<ef-hcm-tool-page-layout #workspace>
	<ui5-bar slot="header">
		<ui5-button
			slot="startContent"
			accessibleName="Toggle navigation"
			icon="menu2"
			(ui5Click)="workspace.toggleNavigation()"
		/>
	</ui5-bar>
	<ui5-side-navigation slot="sideContent" accessibleName="Workspace areas">
		<!-- Consumer-owned native navigation items. -->
	</ui5-side-navigation>
	<ui5-page>
		<ui5-bar slot="header"><ui5-text slot="startContent">Page title</ui5-text></ui5-bar>
		<!-- Consumer-owned feature content; optionally project a native footer. -->
	</ui5-page>
</ef-hcm-tool-page-layout>
```

Project the actual native elements into the named slots; do not insert an HTML wrapper around SideNavigation. Default content can be native Page or FlexibleColumnLayout. Native controls continue to own their own APIs and events.

The workspace header does not replace the content page header. Each occupied FCL column must also be backed by a page. Follow the shared [page and centered-canvas standard](../../../../../../docs/hcm/ux/page-layout.md). Include the native Text wrapper used by this example in the consumer's imports.

`mode` supports `Auto` (default), `Expanded`, `Collapsed` and two-way binding. `toggleNavigation()` uses the native panel state, including phone dismissal. `resetNavigation()` returns to responsive Auto mode after navigation. Resizing also returns to Auto. Features own navigation selection, permission filtering and routing. Object detail content belongs in Object Page; forms and tables use native components directly.

Theme and density are inherited from the shared HCM theme engine. Theme Lab defaults to compact and lets the avatar menu select any of the four themes. See the [floorplan guide](../../../../../../docs/hcm/ux/floorplans/README.md) and [Theme Lab](../../../../../../docs/hcm/ux/theme-lab/README.md). Visual and accessibility review is required before business-feature adoption.
