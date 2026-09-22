import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { ShellBar } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { getVisibleHcmSpaces } from '@empflowyee/hcm-web-navigation-catalog'
import { HcmThemeService } from '@empflowyee/hcm-web-ux-theme'

@Component({
	selector: 'ef-hcm-shell',
	standalone: true,
	imports: [RouterOutlet, ShellBar],
	templateUrl: './hcm-shell.component.html',
	styleUrl: './hcm-shell.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmShellComponent {
	readonly runtime = inject(HcmRuntimeStore)
	readonly theme = inject(HcmThemeService)
	readonly spaces = computed(
		/** Filter visible Spaces using fixture roles and entitlements. */ () =>
			getVisibleHcmSpaces(this.runtime.roles(), this.runtime.entitlements()),
	)
	readonly tenantLabel = computed(
		/** Read the tenant label for global chrome. */ () => this.runtime.tenant().displayName,
	)
	readonly activeSpaceId = signal('employee')

	/** Connect runtime presentation preferences to the theme service. */ constructor() {
		effect(
			/** Resolve the user theme over the tenant default and apply the tenant accent. */ () => {
				const tenant = this.runtime.tenant()
				const preferences = this.runtime.preferences()
				this.theme.setVariant(preferences.theme ?? tenant.defaultTheme)
				this.theme.setTenantPrimary(tenant.primaryColor ?? null)
			},
		)
	}
}
