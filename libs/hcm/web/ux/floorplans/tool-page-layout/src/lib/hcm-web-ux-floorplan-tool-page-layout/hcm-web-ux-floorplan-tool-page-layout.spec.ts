import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { NavigationLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/navigation-layout'
import { describe, expect, it, vi } from 'vitest'
import { HcmToolPageLayout } from './hcm-web-ux-floorplan-tool-page-layout'

describe('HcmToolPageLayout', /** Check integration with native state rather than implementing another layout engine. */ () => {
	it('toggles from native collapsed state and restores Auto on viewport resize', /** Preserve native phone dismissal and responsive mode changes. */ () => {
		const fixture = TestBed.createComponent(HcmToolPageLayout)
		fixture.detectChanges()
		const wrapper = fixture.debugElement.query(By.directive(NavigationLayout))
			.componentInstance as NavigationLayout
		const native = wrapper.elementRef.nativeElement
		vi.spyOn(native, 'isSideCollapsed').mockReturnValue(true)
		fixture.componentInstance.toggleNavigation()
		fixture.detectChanges()
		expect(native.mode).toBe('Expanded')
		window.dispatchEvent(new Event('resize'))
		fixture.detectChanges()
		expect(native.mode).toBe('Auto')
		expect(fixture.componentInstance.mode()).toBe('Auto')
	})
})
