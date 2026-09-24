import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { DynamicPage } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page'
import { DynamicPageTitle } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-title'
import { DynamicPageHeader } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-header'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { IllustratedMessage } from '@fundamental-ngx/ui5-webcomponents-fiori/illustrated-message'
import '@ui5/webcomponents-fiori/dist/illustrations/NoData.js'
import '@ui5/webcomponents-fiori/dist/illustrations/UnableToLoad.js'
import '@ui5/webcomponents-fiori/dist/illustrations/tnt/Lock.js'

export type HcmPageState = 'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'
export interface HcmPageAction {
	id: string
	label: string
	mutates?: boolean
	emphasized?: boolean
	disabled?: boolean
}

/** Apply HCM state and action conventions while UI5 owns the entire dynamic-page layout. */
@Component({
	selector: 'ef-hcm-dynamic-page',
	imports: [
		Title,
		Text,
		DynamicPage,
		DynamicPageTitle,
		DynamicPageHeader,
		Toolbar,
		ToolbarButton,
		BusyIndicator,
		MessageStrip,
		Button,
		IllustratedMessage,
	],
	templateUrl: './dynamic-page.component.html',
	styleUrl: './dynamic-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmDynamicPage {
	readonly title = input.required<string>()
	readonly summary = input('')
	readonly state = input<HcmPageState>('content')
	readonly readOnly = input(false)
	readonly actions = input<readonly HcmPageAction[]>([])
	readonly showFooter = input(false)
	readonly errorMessage = input('This content could not be loaded. Try again.')
	readonly action = output<string>()
	readonly retry = output<void>()
	readonly visibleActions = computed(
		/** Read-only restricts mutations while preserving navigation and other safe actions. */ () =>
			this.actions().filter(
				/** Exclude only mutating actions in read-only mode. */ (item) =>
					!this.readOnly() || !item.mutates,
			),
	)
}
