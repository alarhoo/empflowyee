import { Directive, TemplateRef, inject, input } from '@angular/core'

/** Declare a stable, labeled object section without coupling the floorplan to business fields. */
@Directive({ selector: 'ng-template[efHcmObjectSection]' })
export class HcmObjectSection {
	readonly id = input.required<string>({ alias: 'efHcmObjectSection' })
	readonly label = input.required<string>()
	readonly template = inject<TemplateRef<unknown>>(TemplateRef)
}
