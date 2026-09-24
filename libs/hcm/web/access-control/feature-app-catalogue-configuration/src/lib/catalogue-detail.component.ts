import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import type { CatalogueEntry, CatalogueDiscovery } from '@empflowyee/hcm-access-control-contract'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
@Component({
	selector: 'ef-hcm-catalogue-detail',
	imports: [
		Label,
		FormItem,
		Form,
		HcmObjectPage,
		HcmObjectSection,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		MessageStrip,
		Button,
		Text,
	],
	templateUrl: './catalogue-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogueDetailComponent {
	readonly entry = input<CatalogueEntry | null>(null)
	readonly parentState = input<HcmPageState>('loading')
	readonly subject = input('')
	readonly explanation = input<CatalogueDiscovery['items'][number] | null>(null)
	readonly pending = input(false)
	readonly error = input('')
	readonly closed = output<void>()
	readonly retry = output<void>()
	/** Explain a stable server reason without treating it as business authorization. */
	reason(code: string): string {
		const labels: Record<string, string> = {
			'account-disabled': 'Account is disabled',
			'missing-discovery-permission': 'Missing catalogue discovery permission',
			'missing-entitlement': 'Required tenant entitlement is not enabled',
			'no-role-placement': 'No visible Space placement for the account’s roles',
		}
		return labels[code] ?? code
	}
}
