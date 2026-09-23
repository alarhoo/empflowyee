import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core'
import { Popover } from '@fundamental-ngx/ui5-webcomponents/popover'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { HcmRuntimeStore, HcmApplicationNavigation } from '@empflowyee/hcm-web-runtime-context'
import { findHcmFeature } from '@empflowyee/hcm-web-navigation-catalog'

@Component({
	selector: 'ef-hcm-profile-menu',
	imports: [Popover, Title, Select, Option, CheckBox, Bar, Button],
	templateUrl: './hcm-profile-menu.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmProfileMenuComponent {
	readonly open = input(false)
	readonly opener = input<HTMLElement | null>(null)
	readonly closed = output<void>()
	readonly runtime = inject(HcmRuntimeStore)
	readonly applications = inject(HcmApplicationNavigation)
	private pendingPersona: string | null = null

	/** Open the canonical profile entry through the same availability policy as its tile. */
	openProfile(): void {
		this.closed.emit()
		const profile = findHcmFeature('MY_PROFILE')
		if (profile) void this.applications.open(profile)
	}
	/** Request native popup dismissal before replacing its session and anchor element. */
	selectPersona(value: string): void {
		this.pendingPersona = value
		this.closed.emit()
	}

	/** Finish persona switching only after the native close lifecycle has restored focus. */
	async afterClose(): Promise<void> {
		this.closed.emit()
		const persona = this.pendingPersona
		this.pendingPersona = null
		if (persona) await this.applications.selectPersona(persona)
	}
}
