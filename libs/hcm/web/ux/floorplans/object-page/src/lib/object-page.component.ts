import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChildren,
	input,
	output,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import {
	DynamicPageComponent,
	DynamicPageHeaderComponent,
	DynamicPageSubheaderComponent,
	DynamicPageContentComponent,
	DynamicPageGlobalActionsComponent,
	DynamicPageTitleContentComponent,
} from '@fundamental-ngx/core/dynamic-page'
import { IconTabBarComponent, IconTabBarTabComponent } from '@fundamental-ngx/platform/icon-tab-bar'
import { FacetComponent } from '@fundamental-ngx/core/facets'
import { ButtonComponent } from '@fundamental-ngx/core/button'
import { ToolbarComponent, ToolbarItemDirective } from '@fundamental-ngx/core/toolbar'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { IllustratedMessage } from '@fundamental-ngx/ui5-webcomponents-fiori/illustrated-message'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import '@ui5/webcomponents-fiori/dist/illustrations/NoData.js'
import '@ui5/webcomponents-fiori/dist/illustrations/UnableToLoad.js'
import '@ui5/webcomponents-fiori/dist/illustrations/tnt/Lock.js'
import { HcmObjectSection } from './object-section.directive'

export interface HcmObjectAction {
	id: string
	label: string
	mutates?: boolean
	emphasized?: boolean
	disabled?: boolean
}

/** Project object sections into maintained Platform navigation without implementing a scroll engine. */
@Component({
	selector: 'ef-hcm-object-page',
	imports: [
		DynamicPageComponent,
		DynamicPageHeaderComponent,
		DynamicPageSubheaderComponent,
		DynamicPageContentComponent,
		DynamicPageGlobalActionsComponent,
		DynamicPageTitleContentComponent,
		IconTabBarComponent,
		IconTabBarTabComponent,
		FacetComponent,
		NgTemplateOutlet,
		ButtonComponent,
		ToolbarComponent,
		ToolbarItemDirective,
		BusyIndicator,
		IllustratedMessage,
		MessageStrip,
	],
	templateUrl: './object-page.component.html',
	styleUrl: './object-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmObjectPage {
	readonly title = input.required<string>()
	readonly summary = input('')
	readonly state = input<'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'>(
		'content',
	)
	readonly readOnly = input(false)
	readonly actions = input<readonly HcmObjectAction[]>([])
	readonly errorMessage = input('This object could not be loaded. Try again.')
	readonly action = output<string>()
	readonly retry = output<void>()
	readonly sectionChange = output<string>()
	readonly sections = contentChildren(HcmObjectSection)
	readonly visibleActions = computed(
		/** Keep non-mutating object actions available to read-only users. */ () =>
			this.actions().filter(
				/** Hide only actions explicitly marked as mutations. */ (item) =>
					!this.readOnly() || !item.mutates,
			),
	)
}
