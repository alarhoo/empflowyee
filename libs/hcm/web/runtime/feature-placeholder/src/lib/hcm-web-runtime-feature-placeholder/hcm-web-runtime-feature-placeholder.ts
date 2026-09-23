import { ChangeDetectionStrategy, Component } from '@angular/core'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'

@Component({
	selector: 'ef-hcm-runtime-placeholder',
	imports: [Page, Bar, Title],
	templateUrl: './hcm-web-runtime-feature-placeholder.html',
	styleUrl: './hcm-web-runtime-feature-placeholder.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmWebRuntimeFeaturePlaceholder {}
