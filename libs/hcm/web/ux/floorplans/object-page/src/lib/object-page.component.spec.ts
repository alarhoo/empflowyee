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
