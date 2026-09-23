import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TabContainer } from '@fundamental-ngx/ui5-webcomponents/tab-container'
import { Tab } from '@fundamental-ngx/ui5-webcomponents/tab'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmApplicationTilesComponent } from './hcm-application-tiles.component'
import { HcmLaunchpadState } from './hcm-launchpad.state'
import { hcmSpaceIcon } from './hcm-launchpad.icons'

@Component({
	selector: 'ef-hcm-launchpad',
	providers: [HcmLaunchpadState],
	imports: [
		TabContainer,
		Tab,
		Title,
		Bar,
		Page,
		Dialog,
		Button,
		MessageStrip,
		HcmApplicationTilesComponent,
	],
	templateUrl: './hcm-launchpad.component.html',
	// Native Page requires an explicit content viewport; its internal spacing and appearance remain native.
	styles: [':host { display: block; height: 100%; } ui5-page { height: 100%; }'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmLaunchpadComponent {
	readonly state = inject(HcmLaunchpadState)
	readonly spaceIcon = hcmSpaceIcon
}
