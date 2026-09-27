import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChildren,
	input,
	output,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { Wizard } from '@fundamental-ngx/ui5-webcomponents-fiori/wizard'
import { WizardStep } from '@fundamental-ngx/ui5-webcomponents-fiori/wizard-step'
import { DynamicPage } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page'
import { DynamicPageTitle } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-title'
import { IllustratedMessage } from '@fundamental-ngx/ui5-webcomponents-fiori/illustrated-message'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import '@ui5/webcomponents-fiori/dist/illustrations/NoData.js'
import '@ui5/webcomponents-fiori/dist/illustrations/UnableToLoad.js'
import '@ui5/webcomponents-fiori/dist/illustrations/tnt/Lock.js'
import { HcmWizardStep } from './wizard-step.directive'

export type HcmWizardState = 'content' | 'loading' | 'error' | 'denied' | 'unavailable'

/** A move the page asks the feature to make; the feature validates and then sets `current`. */
export interface HcmWizardMove {
	from: string
	to: string
}

/**
 * Guided multi-step process on a dedicated route (UX-FP-WIZARD, NATIVE): the native UI5 Wizard
 * inside a native UI5 DynamicPage with the shared HCM page states. The page renders the steps, the step header and the footer
 * navigation; the feature owns step validity and decides every move, so no feature hand-builds
 * step navigation and the page never invents business progression rules.
 */
@Component({
	selector: 'ef-hcm-wizard-page',
	imports: [
		NgTemplateOutlet,
		DynamicPage,
		DynamicPageTitle,
		IllustratedMessage,
		Title,
		Text,
		Wizard,
		WizardStep,
		Bar,
		Button,
		BusyIndicator,
	],
	templateUrl: './wizard-page.component.html',
	styleUrl: './wizard-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmWizardPage {
	readonly title = input.required<string>()
	readonly summary = input('')
	readonly state = input<HcmWizardState>('content')
	readonly errorMessage = input('This content could not be loaded. Try again.')
	/** The step shown now. */
	readonly current = input.required<string>()
	/** The furthest step the user may open from the step header; later steps stay disabled. */
	readonly reachable = input<string | null>(null)
	/** While true every navigation is disabled, for example during the final submission. */
	readonly busy = input(false)
	readonly nextLabel = input('Next step')
	readonly finishLabel = input('Submit')
	/** The feature validates the current step and moves to `to` when it is valid. */
	readonly next = output<HcmWizardMove>()
	/** The user chose an earlier or reachable step; moving back never needs validation. */
	readonly stepChange = output<string>()
	readonly finish = output<void>()
	readonly cancelled = output<void>()
	readonly retry = output<void>()
	readonly steps = contentChildren(HcmWizardStep)
	readonly index = computed(
		/** Position of the current step. */ () =>
			this.steps().findIndex(/** Current. */ (step) => step.id() === this.current()),
	)
	readonly limit = computed(
		/** Position of the furthest reachable step, never before the current one. */ () => {
			const reachable = this.steps().findIndex(
				/** Reachable. */ (step) => step.id() === this.reachable(),
			)
			return Math.max(reachable, this.index())
		},
	)
	readonly last = computed(/** On the final step. */ () => this.index() === this.steps().length - 1)

	/** Ask the feature to move to the following step. */
	forward(): void {
		const following = this.steps()[this.index() + 1]
		if (following && !this.busy()) this.next.emit({ from: this.current(), to: following.id() })
	}

	/** Return to the previous step. */
	back(): void {
		const previous = this.steps()[this.index() - 1]
		if (previous && !this.busy()) this.stepChange.emit(previous.id())
	}

	/** Follow a step chosen in the native step header. */
	choose(step: HTMLElement | undefined): void {
		const id = step?.dataset['step']
		if (!id || id === this.current() || this.busy()) return
		const target = this.steps().findIndex(/** Chosen. */ (item) => item.id() === id)
		if (target >= 0 && target <= this.limit()) this.stepChange.emit(id)
	}
}
