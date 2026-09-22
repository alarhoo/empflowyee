import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterLink } from '@angular/router'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'

// Schematic Theme Lab fixture, not a production floorplan or business form.
@Component({
	selector: 'ef-hcm-object-page-preview',
	imports: [Button, Input, RouterLink],
	templateUrl: './object-page-preview.component.html',
	styleUrl: './object-page-preview.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectPagePreview {}
