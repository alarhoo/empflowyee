import { ChangeDetectionStrategy, Component } from '@angular/core'

// Schematic Theme Lab fixture, not a production floorplan or business form.
@Component({
	selector: 'ef-hcm-flexible-columns-preview',
	imports: [],
	templateUrl: './flexible-columns-preview.component.html',
	styleUrl: './flexible-columns-preview.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlexibleColumnsPreview {}
