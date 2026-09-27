import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { TestBed } from '@angular/core/testing'
import { Component, signal } from '@angular/core'
import { By } from '@angular/platform-browser'
import { describe, expect, it } from 'vitest'
import { HcmObjectPage } from './object-page.component'
import { HcmObjectSection } from './object-section.directive'

/** Exercise conditional sections through real Angular content projection. */
@Component({
	imports: [HcmObjectPage, HcmObjectSection],
	template: `
		<ef-hcm-object-page title="Record" [lazySections]="true">
			<ng-template efHcmObjectSection="personal" label="Personal">
				<p data-testid="personal">Personal details</p>
			</ng-template>
			@if (showEmployment()) {
				<ng-template efHcmObjectSection="employment" label="Employment">
					<p data-testid="employment">Employment details</p>
				</ng-template>
			}
		</ef-hcm-object-page>
	`,
})
class LazySectionsHost {
	readonly showEmployment = signal(true)
}

it('mounts only the selected content and recovers when that section disappears', /** Lazy sections must not expose inactive fields or leave a blank page after a policy refresh. */ () => {
	const fixture = TestBed.createComponent(LazySectionsHost)
	fixture.detectChanges()
	const page = fixture.debugElement.query(By.directive(HcmObjectPage))
		.componentInstance as HcmObjectPage
	expect(fixture.nativeElement.querySelector('[data-testid="personal"]')).not.toBeNull()
	expect(fixture.nativeElement.querySelector('[data-testid="employment"]')).toBeNull()
	page.selectSection('employment')
	fixture.detectChanges()
	expect(fixture.nativeElement.querySelector('[data-testid="personal"]')).toBeNull()
	expect(fixture.nativeElement.querySelector('[data-testid="employment"]')).not.toBeNull()
	fixture.componentInstance.showEmployment.set(false)
	fixture.detectChanges()
	expect(fixture.nativeElement.querySelector('[data-testid="personal"]')).not.toBeNull()
	expect(page.activeSection()).toBe('personal')
	fixture.componentInstance.showEmployment.set(true)
	fixture.detectChanges()
	expect(page.activeSection()).toBe('personal')
	expect(fixture.nativeElement.querySelector('[data-testid="employment"]')).toBeNull()
})

describe('HcmObjectPage', /** Verify the product-owned action policy; browser checks cover native sections. */ () => {
	it('keeps navigation available when the selected object fails to load', /** A failed mid-column object must not trap phone users; mutation actions remain unavailable. */ () => {
		const fixture = TestBed.createComponent(HcmObjectPage)
		fixture.componentRef.setInput('title', 'Unavailable role')
		fixture.componentRef.setInput('state', 'error')
		fixture.componentRef.setInput('actions', [
			{ id: 'edit', label: 'Edit', mutates: true },
			{ id: 'back', label: 'Back to list' },
		])
		expect(
			fixture.componentInstance
				.visibleActions()
				.map(/** Inspect stable action identities. */ (item) => item.id),
		).toEqual(['back'])
	})
	it('omits only mutating actions for read-only users', /** Reading and navigation remain available regardless of edit permission. */ () => {
		const fixture = TestBed.createComponent(HcmObjectPage)
		fixture.componentRef.setInput('title', 'Fixture')
		fixture.componentRef.setInput('actions', [
			{ id: 'edit', label: 'Edit', mutates: true },
			{ id: 'reference', label: 'Reference' },
		])
		fixture.componentRef.setInput('readOnly', true)
		expect(
			fixture.componentInstance
				.visibleActions()
				.map(/** Compare the stable public identities. */ (item) => item.id),
		).toEqual(['reference'])
	})
})

it('restores the native split and separates navigation close from business close', /** The toolbar must not accidentally submit the Close review command. */ () => {
	const native = { layout: 'TwoColumnsMidExpanded' }
	TestBed.configureTestingModule({
		providers: [
			{ provide: FlexibleColumnLayout, useValue: { elementRef: { nativeElement: native } } },
		],
	})
	const fixture = TestBed.createComponent(HcmObjectPage)
	fixture.componentRef.setInput('title', 'Review')
	fixture.componentRef.setInput('actions', [
		{ id: 'back', label: 'Back to reviews' },
		{ id: 'close', label: 'Close review', mutates: true },
	])
	const page = fixture.componentInstance
	const emitted: string[] = []
	page.action.subscribe(
		/** Observe delegated navigation rather than a business mutation. */ (value) =>
			emitted.push(value),
	)
	page.toggleMaximized()
	expect(native.layout).toBe('MidColumnFullScreen')
	page.toggleMaximized()
	expect(native.layout).toBe('TwoColumnsMidExpanded')
	page.closeDetail()
	expect(emitted).toEqual(['back'])
	expect(
		page.visibleActions().map(/** Identify the retained business action. */ (item) => item.id),
	).toEqual(['close'])
})

it('expands an end-column detail within the three-column layout', /** A third-column object must not collapse into the middle column when maximized. */ () => {
	const native = { layout: 'ThreeColumnsEndExpanded' }
	TestBed.configureTestingModule({
		providers: [
			{ provide: FlexibleColumnLayout, useValue: { elementRef: { nativeElement: native } } },
		],
	})
	const fixture = TestBed.createComponent(HcmObjectPage)
	fixture.componentRef.setInput('title', 'Unit')
	fixture.componentRef.setInput('column', 'end')
	const page = fixture.componentInstance
	page.toggleMaximized()
	expect(native.layout).toBe('EndColumnFullScreen')
	page.toggleMaximized()
	expect(native.layout).toBe('ThreeColumnsEndExpanded')
})
