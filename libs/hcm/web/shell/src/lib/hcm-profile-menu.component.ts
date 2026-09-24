import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { UserMenu } from '@fundamental-ngx/ui5-webcomponents-fiori/user-menu'
import { UserMenuAccount } from '@fundamental-ngx/ui5-webcomponents-fiori/user-menu-account'
import { UserMenuItem } from '@fundamental-ngx/ui5-webcomponents-fiori/user-menu-item'
import { HcmRuntimeStore, HcmApplicationNavigation } from '@empflowyee/hcm-web-runtime-context'
import { findHcmFeature } from '@empflowyee/hcm-web-navigation-catalog'
import { HcmSettingsComponent } from './hcm-settings.component'
import '@ui5/webcomponents-icons/dist/action-settings.js'
import '@ui5/webcomponents-icons/dist/employee.js'
@Component({
	selector: 'ef-hcm-profile-menu',
	imports: [UserMenu, UserMenuAccount, UserMenuItem, HcmSettingsComponent],
	templateUrl: './hcm-profile-menu.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmProfileMenuComponent {
	readonly open = input(false)
	readonly opener = input<HTMLElement | null>(null)
	readonly closed = output<void>()
	readonly runtime = inject(HcmRuntimeStore)
	readonly applications = inject(HcmApplicationNavigation)
	readonly settingsOpen = signal(false)
	readonly initials = computed(
		/** Fall back to initials only when no profile photo was supplied. */ () =>
			(this.runtime.context()?.user.displayName ?? '')
				.split(/\s+/)
				.slice(0, 2)
				.map(/** Pick the first letter of each name. */ (part) => part[0] ?? '')
				.join('')
				.toUpperCase(),
	)
	/** Dismiss native profile chrome before displaying its native settings dialog. */
	settings(): void {
		this.closed.emit()
		this.settingsOpen.set(true)
	}
	/** Resolve the profile destination through the same catalogue policy as its tile. */
	openProfile(): void {
		this.closed.emit()
		const profile = findHcmFeature('MY_PROFILE')
		if (profile) void this.applications.open(profile)
	}
	/** Leave the local workspace only after the active feature's dirty-state guard permits it. */
	async signOut(): Promise<void> {
		this.closed.emit()
		await this.applications.signOut()
	}
}
