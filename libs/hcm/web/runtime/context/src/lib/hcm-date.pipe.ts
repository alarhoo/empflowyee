import { inject, Pipe, PipeTransform } from '@angular/core'
import { HcmRuntimeStore } from './hcm-runtime.store'

/** Render API dates through the current account's reactive presentation preferences. */
@Pipe({ name: 'hcmDate', pure: false })
export class HcmDatePipe implements PipeTransform {
	private readonly runtime = inject(HcmRuntimeStore)
	/** Keep calendar dates timezone-free and timestamps in the account timezone. */
	transform(
		value: string | Date | null | undefined,
		kind: 'date' | 'timestamp' = 'timestamp',
	): string {
		if (!value) return '—'
		return this.runtime.formatTimestamp(value, kind === 'date')
	}
}
