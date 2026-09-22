import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { HcmDynamicPage } from './dynamic-page.component'

describe('HcmDynamicPage', /** Verify product action policy without duplicating UI5's layout tests. */ () => {
	it('preserves non-mutating actions in read-only views', /** Navigation and informational actions remain available when editing is prohibited. */ () => {
		const fixture = TestBed.createComponent(HcmDynamicPage)
		fixture.componentRef.setInput('title', 'Directory')
		fixture.componentRef.setInput('actions', [
			{ id: 'edit', label: 'Edit', mutates: true },
			{ id: 'reference', label: 'Reference' },
		])
		fixture.componentRef.setInput('readOnly', true)
		expect(
			fixture.componentInstance
				.visibleActions()
				.map(/** Compare the public action identities. */ (item) => item.id),
		).toEqual(['reference'])
	})
})
