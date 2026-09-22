import { ChangeDetectionStrategy, Component } from '@angular/core'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'

// Schematic Theme Lab fixture, not a production floorplan or business form.
@Component({
	selector: 'ef-hcm-table-form-preview',
	imports: [Button, Input],
	templateUrl: './table-form-preview.component.html',
	styleUrl: './table-form-preview.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableFormPreview {}
