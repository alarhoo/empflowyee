import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { HcmAnalyticalListPage } from './analytical-list-page.component'

describe('HcmAnalyticalListPage', /** Verify our view-state and retry contract independently of native layout internals. */ () => {
	it('presents denied and empty states distinctly', /** State messages must not imply an empty result is a permission failure. */ () => {
		const fixture = TestBed.createComponent(HcmAnalyticalListPage)
		fixture.componentRef.setInput('title', 'Fixture')
		fixture.componentRef.setInput('state', 'denied')
		fixture.detectChanges()
		expect(fixture.nativeElement.textContent).toContain('do not have permission')
		fixture.componentRef.setInput('state', 'empty')
		fixture.detectChanges()
		expect(fixture.nativeElement.textContent).toContain('No content')
		expect(fixture.nativeElement.textContent).not.toContain('do not have permission')
	})
	it('delegates retry and suppresses mutation regions in read-only mode', /** Retry is an output; loading and authorization belong to the consumer. */ () => {
		const fixture = TestBed.createComponent(HcmAnalyticalListPage)
		fixture.componentRef.setInput('title', 'Fixture')
		fixture.componentRef.setInput('state', 'error')
		const retry = vi.fn()
		fixture.componentInstance.retry.subscribe(retry)
		fixture.detectChanges()
		fixture.nativeElement.querySelector('ui5-button').click()
		expect(retry).toHaveBeenCalledOnce()
		fixture.componentRef.setInput('state', 'content')
		fixture.componentRef.setInput('readOnly', true)
		fixture.detectChanges()
		expect(fixture.nativeElement.querySelector('[slot="actionsBar"]')).toBeNull()
		expect(fixture.nativeElement.textContent).toContain('Read-only')
	})
})
