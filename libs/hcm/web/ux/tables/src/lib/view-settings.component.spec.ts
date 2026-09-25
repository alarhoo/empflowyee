import { TestBed } from '@angular/core/testing'
import { expect, it, vi } from 'vitest'
import { HcmViewSettings } from './view-settings.component'

it('emits only supported confirmed sort fields without fetching data', /** Keep native presentation separate from feature-owned server queries. */ () => {
	const fixture = TestBed.createComponent(HcmViewSettings)
	fixture.componentRef.setInput('label', 'Roles')
	fixture.componentRef.setInput('value', 'label:asc')
	fixture.componentRef.setInput('fields', [{ key: 'label', label: 'Name' }])
	const emit = vi.spyOn(fixture.componentInstance.sortChange, 'emit')
	fixture.componentInstance.confirm('invented', false)
	expect(emit).not.toHaveBeenCalled()
	fixture.componentInstance.confirm('label', true)
	expect(emit).toHaveBeenCalledWith('label:desc')
	fixture.componentRef.setInput('disabled', true)
	fixture.componentInstance.confirm('label', false)
	expect(emit).toHaveBeenCalledTimes(1)
})
