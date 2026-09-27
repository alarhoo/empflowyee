import { Directive, TemplateRef, inject, input } from '@angular/core'

/** One wizard step's content, rendered inside the native UI5 WizardStep of the same id. */
@Directive({ selector: 'ng-template[efHcmWizardStep]' })
export class HcmWizardStep {
	readonly id = input.required<string>({ alias: 'efHcmWizardStep' })
	readonly title = input.required<string>()
	readonly template = inject<TemplateRef<unknown>>(TemplateRef)
}
