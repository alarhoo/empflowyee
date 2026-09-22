import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { form } from '@angular/forms/signals'
import { describe, expect, it, vi } from 'vitest'
import { HcmFormActions } from './form-actions.component'
import { mapServerValidation } from './server-validation'

describe('HcmFormActions', /** Verify our save guard and explicit discard semantics. */ () => {
	it('requires confirmation before discarding dirty input', /** Keep editing must preserve the form until a later confirmed cancel. */ () => {
		const fixture = TestBed.createComponent(HcmFormActions)
		fixture.componentRef.setInput('dirty', true)
		const cancel = vi.fn()
		fixture.componentInstance.cancelRequested.subscribe(cancel)
		fixture.componentInstance.requestCancel()
		expect(fixture.componentInstance.confirmingDiscard()).toBe(true)
		expect(cancel).not.toHaveBeenCalled()
		fixture.componentInstance.confirmDiscard()
		expect(cancel).toHaveBeenCalledOnce()
	})
	it('blocks duplicate or invalid saves', /** Button state and programmatic calls share the same submission guard. */ () => {
		const fixture = TestBed.createComponent(HcmFormActions)
		fixture.componentRef.setInput('dirty', true)
		const save = vi.fn()
		fixture.componentInstance.saveRequested.subscribe(save)
		fixture.componentRef.setInput('valid', false)
		fixture.componentInstance.requestSave()
		fixture.componentRef.setInput('valid', true)
		fixture.componentRef.setInput('saving', true)
		fixture.componentInstance.requestSave()
		expect(save).not.toHaveBeenCalled()
		fixture.componentRef.setInput('saving', false)
		fixture.componentInstance.requestSave()
		expect(save).toHaveBeenCalledOnce()
	})
	it('maps only declared server field identifiers', /** Unknown or prototype-shaped paths cannot select arbitrary fields. */ () => {
		const tree = TestBed.runInInjectionContext(
			/** Build a real Signal Form for error association. */ () => form(signal({ email: '' })),
		)
		const errors = mapServerValidation(
			[
				{ field: 'email', message: 'Already used' },
				{ field: '__proto__', message: 'Unknown field' },
			],
			{ email: tree.email },
			tree,
		)
		expect(errors[0].fieldTree).toBe(tree.email)
		expect(errors[1].fieldTree).toBe(tree)
	})
})
