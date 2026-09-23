import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import {
	TileComponent,
	TileContainerDirective,
	TileHeaderDirective,
	TileTitleDirective,
	TileSubtitleDirective,
	TileFooterDirective,
	TileFooterTextDirective,
} from '@fundamental-ngx/core/tile'
import type { HcmFeatureDefinition } from '@empflowyee/hcm-web-navigation-catalog'
import { Icon } from '@fundamental-ngx/ui5-webcomponents/icon'
import { hcmDomainIcon } from './hcm-launchpad.icons'

@Component({
	selector: 'ef-hcm-application-tiles',
	imports: [
		Icon,
		TileComponent,
		TileContainerDirective,
		TileHeaderDirective,
		TileTitleDirective,
		TileSubtitleDirective,
		TileFooterDirective,
		TileFooterTextDirective,
	],
	templateUrl: './hcm-application-tiles.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmApplicationTilesComponent {
	readonly domainIcon = hcmDomainIcon
	readonly applications = input.required<readonly HcmFeatureDefinition[]>()
	readonly applicationSelected = output<HcmFeatureDefinition>()
}
