import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { DynamicPage } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page'
import { DynamicPageTitle } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-title'
import { DynamicPageHeader } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-header'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'

/** Compose analytical list page regions; the consuming feature supplies data, actions and authorization state. */
@Component({
	selector: 'ef-hcm-analytical-list-page',
	imports: [DynamicPage, DynamicPageTitle, DynamicPageHeader, BusyIndicator, MessageStrip, Button],
	templateUrl: './analytical-list-page.component.html',
	styleUrl: './analytical-list-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmAnalyticalListPage {
	readonly title = input.required<string>()
	readonly summary = input('')
	readonly state = input<'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'>(
		'content',
	)
	readonly readOnly = input(false)
	readonly errorMessage = input('This content could not be loaded.')
	readonly retry = output<void>()
}
