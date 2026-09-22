import { Component, signal } from '@angular/core'
import { type Meta, type StoryObj } from '@storybook/angular'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { SideNavigation } from '@fundamental-ngx/ui5-webcomponents-fiori/side-navigation'
import { SideNavigationItem } from '@fundamental-ngx/ui5-webcomponents-fiori/side-navigation-item'
import { HcmToolPageLayout } from './hcm-web-ux-floorplan-tool-page-layout/hcm-web-ux-floorplan-tool-page-layout'

/** Supply deterministic content to the production layout; no separate story layout is implemented. */
@Component({
	selector: 'ef-tool-page-story',
	imports: [HcmToolPageLayout, Bar, Button, Text, Page, SideNavigation, SideNavigationItem],
	template: `
		<ef-hcm-tool-page-layout #workspace>
			<ui5-bar slot="header">
				<ui5-button
					slot="startContent"
					icon="menu2"
					accessibleName="Toggle navigation"
					(ui5Click)="workspace.toggleNavigation()"
				/>
				<ui5-text slot="startContent">Workspace preview</ui5-text>
			</ui5-bar>
			<ui5-side-navigation slot="sideContent" accessibleName="Workspace areas">
				<ui5-side-navigation-item
					text="Overview"
					[selected]="area() === 'Overview'"
					(ui5Click)="area.set('Overview')"
				/>
				<ui5-side-navigation-item
					text="Activity"
					[selected]="area() === 'Activity'"
					(ui5Click)="area.set('Activity')"
				/>
			</ui5-side-navigation>
			<ui5-page>
				<ui5-bar slot="header"
					><ui5-text slot="startContent">{{ area() }}</ui5-text></ui5-bar
				>
				<ui5-text>{{ area() }} — feature content goes here.</ui5-text>
			</ui5-page>
		</ef-hcm-tool-page-layout>
	`,
	styles: ':host { display: block; height: 80vh; min-height: 20rem; }',
})
class ToolPagePreview {
	readonly area = signal('Overview')
}

const meta: Meta<ToolPagePreview> = {
	title: 'Floorplans/Native/ToolPageLayout',
	component: ToolPagePreview,
	parameters: {
		hcmReview: 'Reusable pilot awaiting visual and accessibility approval for feature adoption.',
		docs: {
			description: {
				component:
					'Production HcmToolPageLayout projects a native header, SideNavigation and content into UI5 NavigationLayout. Use for workspace navigation; use native Page for a simple screen. Toggle navigation and resize to exercise native responsive behavior.',
			},
		},
	},
}
export default meta
type Story = StoryObj<ToolPagePreview>
export const Workspace: Story = {}
