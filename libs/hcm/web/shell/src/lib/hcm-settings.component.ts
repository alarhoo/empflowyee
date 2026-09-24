import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	output,
	signal,
	viewChild,
} from '@angular/core'
import { UserSettingsDialog } from '@fundamental-ngx/ui5-webcomponents-fiori/user-settings-dialog'
import { UserSettingsItem } from '@fundamental-ngx/ui5-webcomponents-fiori/user-settings-item'
import { UserSettingsView } from '@fundamental-ngx/ui5-webcomponents-fiori/user-settings-view'
import { UserSettingsAccountView } from '@fundamental-ngx/ui5-webcomponents-fiori/user-settings-account-view'
import { UserMenuAccount } from '@fundamental-ngx/ui5-webcomponents-fiori/user-menu-account'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { NotificationPreferencesComponent } from '@empflowyee/hcm-web-notifications-feature-my-notification-preferences'
import { HcmRuntimeStore, HcmApplicationNavigation } from '@empflowyee/hcm-web-runtime-context'
import { HCM_THEMES, HcmAppearanceService } from '@empflowyee/hcm-web-ux-theme'
import '@ui5/webcomponents-icons/dist/palette.js'
import '@ui5/webcomponents-icons/dist/globe.js'
import '@ui5/webcomponents-icons/dist/bell.js'
@Component({
	selector: 'ef-hcm-settings',
	imports: [
		UserSettingsDialog,
		UserSettingsItem,
		UserSettingsView,
		UserSettingsAccountView,
		UserMenuAccount,
		Form,
		FormItem,
		Label,
		Text,
		Select,
		Option,
		CheckBox,
		NotificationPreferencesComponent,
	],
	templateUrl: './hcm-settings.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmSettingsComponent {
	readonly runtime = inject(HcmRuntimeStore)
	readonly applications = inject(HcmApplicationNavigation)
	readonly appearance = inject(HcmAppearanceService)
	readonly themes = HCM_THEMES
	readonly previewDate = new Date()
	readonly closed = output<void>()
	readonly open = signal(true)
	readonly notifications = viewChild(NotificationPreferencesComponent)
	private closing = false
	readonly canReadNotifications = computed(
		/** Hide preference data without the matching self-read capability. */ () =>
			this.runtime
				.context()
				?.access.permissions.includes('hcm.notifications.preferences.self.read') === true,
	)
	readonly initials = computed(
		/** Provide an image-free identity fallback. */ () =>
			(this.runtime.context()?.user.displayName ?? '')
				.split(/\s+/)
				.slice(0, 2)
				.map(/** Select a name initial. */ (part) => part[0] ?? '')
				.join('')
				.toUpperCase(),
	)
	/** Preserve the domain preference editor's dirty and saving guards on every native close gesture. */
	async beforeClose(event: Event): Promise<void> {
		if (this.closing) return
		event.preventDefault()
		if (!(await (this.notifications()?.canLeave() ?? Promise.resolve(true)))) return
		this.closing = true
		this.open.set(false)
	}
	/** Close settings and switch only to an advertised development persona after unsaved choices are resolved. */
	async selectPersona(value: string): Promise<void> {
		if (!(await (this.notifications()?.canLeave() ?? Promise.resolve(true)))) return
		this.closed.emit()
		await this.applications.selectPersona(value)
	}
}
