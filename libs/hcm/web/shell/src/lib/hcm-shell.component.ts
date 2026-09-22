import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { RouterLink, RouterOutlet } from '@angular/router'
import { ShellBar } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { getVisibleHcmSpaces, type VisibleHcmSpace } from '@empflowyee/hcm-web-navigation-catalog'
import { HcmThemeService } from '@empflowyee/hcm-web-ux-theme'

@Component({
	selector: 'ef-hcm-shell',
	imports: [RouterOutlet, RouterLink, ShellBar, Button],
	templateUrl: './hcm-shell.component.html',
	styleUrl: './hcm-shell.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmShellComponent {
	readonly runtime = inject(HcmRuntimeStore)
	readonly theme = inject(HcmThemeService)
	readonly spaces = computed(
		/** Project presentation-only navigation from the mock principal. */ () =>
			getVisibleHcmSpaces(this.runtime.roles(), this.runtime.entitlements()),
	)
	readonly tenantLabel = computed(
		/** Display the current tenant in global chrome. */ () => this.runtime.tenant().displayName,
	)
	private readonly selectedSpaceId = signal('administration')
	readonly catalogOpen = signal(false)
	readonly activeSpace = computed<VisibleHcmSpace | undefined>(
		/** Retain the chosen Space only while it remains visible. */ () =>
			this.spaces().find(
				/** Locate the current visible selection. */ (space) => space.id === this.selectedSpaceId(),
			) ?? this.spaces()[0],
	)

	/** Compose presentation defaults; runtime and theme libraries remain independent. */
	constructor() {
		effect(
			/** Apply user-over-tenant theme resolution and the optional tenant accent. */ () => {
				const tenant = this.runtime.tenant()
				const preferences = this.runtime.preferences()
				this.theme.setVariant(preferences.theme ?? tenant.defaultTheme ?? 'horizon-light')
				this.theme.setTenantPrimary(tenant.primaryColor ?? null)
			},
		)
	}

	/** Show a visible Space's Pages and feature placements without routing to unimplemented apps. */
	selectSpace(id: string): void {
		this.selectedSpaceId.set(id)
		this.catalogOpen.set(true)
	}
}
