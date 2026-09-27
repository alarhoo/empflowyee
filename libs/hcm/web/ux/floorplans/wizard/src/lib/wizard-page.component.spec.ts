import { Component, signal, viewChild } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { HcmWizardPage, type HcmWizardMove } from './wizard-page.component'
import { HcmWizardStep } from './wizard-step.directive'

/** A feature-shaped host owning step validity and every move. */
@Component({
	imports: [HcmWizardPage, HcmWizardStep],
	template: `<ef-hcm-wizard-page
		title="Create worker"
		[current]="current()"
		[reachable]="reachable()"
		[busy]="busy()"
		(next)="moves.push($event)"
		(stepChange)="changes.push($event)"
	>
		<ng-template efHcmWizardStep="person" title="Person">Person</ng-template>
		<ng-template efHcmWizardStep="employment" title="Employment">Employment</ng-template>
		<ng-template efHcmWizardStep="review" title="Review">Review</ng-template>
	</ef-hcm-wizard-page>`,
})
class Host {
	readonly current = signal('employment')
	readonly reachable = signal<string | null>('employment')
	readonly busy = signal(false)
	readonly moves: HcmWizardMove[] = []
	readonly changes: string[] = []
	readonly page = viewChild.required(HcmWizardPage)
}

/** A step header element as the native Wizard reports it. */
function header(id: string): HTMLElement {
	const element = document.createElement('div')
	element.dataset['step'] = id
	return element
}

describe('HcmWizardPage', /** Verify the navigation contract without duplicating UI5's Wizard tests. */ () => {
	it('asks the feature to move forward and moves back without validation', /** Features own step validity. */ () => {
		const fixture = TestBed.createComponent(Host)
		fixture.detectChanges()
		const page = fixture.componentInstance.page()
		expect(page.steps().map(/** Step ids. */ (step) => step.id())).toEqual([
			'person',
			'employment',
			'review',
		])
		expect(page.index()).toBe(1)
		page.forward()
		page.back()
		expect(fixture.componentInstance.moves).toEqual([{ from: 'employment', to: 'review' }])
		expect(fixture.componentInstance.changes).toEqual(['person'])
		expect(page.last()).toBe(false)
	})

	it('opens only reachable steps from the header and nothing while busy', /** Later steps stay disabled until reached. */ () => {
		const fixture = TestBed.createComponent(Host)
		fixture.detectChanges()
		const page = fixture.componentInstance.page()
		page.choose(header('review'))
		page.choose(header('person'))
		expect(fixture.componentInstance.changes).toEqual(['person'])
		fixture.componentInstance.reachable.set('review')
		fixture.detectChanges()
		page.choose(header('review'))
		expect(fixture.componentInstance.changes).toEqual(['person', 'review'])
		fixture.componentInstance.busy.set(true)
		fixture.detectChanges()
		page.forward()
		page.choose(header('person'))
		expect(fixture.componentInstance.moves).toEqual([])
		expect(fixture.componentInstance.changes).toEqual(['person', 'review'])
	})
})
