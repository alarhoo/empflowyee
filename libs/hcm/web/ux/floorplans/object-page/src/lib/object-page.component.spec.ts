import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { HcmObjectPage } from './object-page.component'

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
