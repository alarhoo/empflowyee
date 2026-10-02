import { Directive } from '@angular/core'
import { CVA_CONFIG } from '@fundamental-ngx/ui5-webcomponents/utils'

/** Bind the native DatePicker's committed date instead of its stale value during live input. */
@Directive({
	selector: 'ui5-date-picker[hcmDateField]',
	providers: [{ provide: CVA_CONFIG, useValue: { property: 'value', events: ['change'] } }],
})
export class HcmDateField {}
