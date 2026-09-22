import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core'
import {
	ContentDensityMode,
	GlobalContentDensityService,
} from '@fundamental-ngx/core/content-density'
import { HcmThemeService, type HcmThemeVariant } from '@empflowyee/hcm-web-ux-theme'

/** Connect Storybook globals to the production theme service and native content-density provider. */
@Component({
	selector: 'ef-hcm-story-frame',
	host: { '[class.ui5-content-density-compact]': "density() === 'compact'" },
	template:
		'@if (review()) { <p role="note">{{ review() }}</p> }@if (theme.error()) { <p role="alert">{{ theme.error() }}</p> }<ng-content />',
	styles: ':host { display: block; min-width: 0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmStoryFrame {
	readonly variant = input<HcmThemeVariant>('horizon-light')
	readonly brand = input<string | null>(null)
	readonly density = input<'cozy' | 'compact'>('cozy')
	readonly theme = inject(HcmThemeService)
	readonly review = input<string | null>(null)
	private readonly contentDensity = inject(GlobalContentDensityService)

	/** Apply toolbar changes without loading the app, its runtime context or any API clients. */
	constructor() {
		effect(
			/** Synchronize globals through the maintained presentation services. */ () => {
				this.theme.setVariant(this.variant())
				this.theme.setTenantPrimary(this.brand())
				this.contentDensity.updateContentDensity(
					this.density() === 'compact' ? ContentDensityMode.COMPACT : ContentDensityMode.COZY,
				)
			},
		)
	}
}
