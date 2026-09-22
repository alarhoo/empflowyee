import { ChangeDetectionStrategy, Component } from '@angular/core'

// Schematic Theme Lab fixture, not a production floorplan or business form.
@Component({
	selector: 'ef-hcm-overview-preview',
	imports: [],
	templateUrl: './overview-preview.component.html',
	styleUrl: './overview-preview.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPreview {}
