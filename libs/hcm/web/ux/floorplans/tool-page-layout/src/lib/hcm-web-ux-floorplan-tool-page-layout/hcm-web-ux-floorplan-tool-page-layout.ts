import { ChangeDetectionStrategy, Component, model, viewChild } from '@angular/core'
import { NavigationLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/navigation-layout'

/** Preserve native navigation behavior while exposing the empFLOWyee ToolPageLayout name and slots. */
@Component({
	standalone: true,
	selector: 'ef-hcm-tool-page-layout',
	imports: [NavigationLayout],
	host: { '(window:resize)': 'resetNavigation()' },
	templateUrl: './hcm-web-ux-floorplan-tool-page-layout.html',
	styleUrl: './hcm-web-ux-floorplan-tool-page-layout.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmToolPageLayout {
	readonly mode = model<'Auto' | 'Expanded' | 'Collapsed'>('Auto')
	private readonly navigation = viewChild(NavigationLayout)

	/** Toggle from the native state, including its automatic phone dismissal. */
	toggleNavigation(): void {
		const collapsed = this.navigation()?.elementRef.nativeElement.isSideCollapsed()
		this.mode.set(collapsed ? 'Expanded' : 'Collapsed')
	}

	/** Restore native responsive behavior after navigation or viewport changes. */
	resetNavigation(): void {
		this.mode.set('Auto')
		const native = this.navigation()?.elementRef.nativeElement
		if (native) {
			native.mode = 'Auto'
			native.isSideCollapsed()
		}
	}
}
