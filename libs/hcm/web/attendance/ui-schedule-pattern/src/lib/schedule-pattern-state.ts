import { computed, signal } from '@angular/core'
import { form, maxLength, pattern, required, disabled, validate } from '@angular/forms/signals'
import { HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import { emptyScheduleForm, scheduleFromForm, segmentForm } from './schedule-form'
import { shiftFromForm } from './shift-form'

/** Shared weekly-pattern state and validation; feature owners retain API queries, routing and source authority. */
export class SchedulePatternState {
	readonly singleShift = signal(false)
	readonly isTemplate = signal(true)
	readonly model = signal(emptyScheduleForm())
	readonly submitted = signal(false)
	readonly serverErrors = signal<HcmFieldError[]>([])
	readonly fields = form(
		this.model,
		/** Mirror static contract limits; the universal parser supplies cross-field checks. */ (
			path,
		) => {
			disabled(path, {
				when: /** Prevent changing a command while its receipt is unresolved. */ () =>
					this.draft.saving(),
			})
			required(path.code)
			maxLength(path.code, 40)
			pattern(path.code, /^[A-Z][A-Z0-9_-]*$/)
			required(path.name)
			maxLength(path.name, 120)
			pattern(path.name, /\S/)
			maxLength(path.description, 2000)
			required(path.effectiveFrom)
			required(path.timezoneMode)
			required(path.weekStartsOn, {
				when: /** Reusable shifts have no week-start field. */ () => !this.singleShift(),
			})
			validate(
				path,
				/** Reuse the universal parser as Signal Forms cross-field validation. */ ({ value }) => {
					try {
						if (this.singleShift()) shiftFromForm(value())
						else scheduleFromForm(value(), this.isTemplate())
						return null
					} catch {
						return { kind: 'schedule', message: 'Complete the highlighted schedule fields.' }
					}
				},
			)
		},
	)
	readonly draft = new HcmDraft(
		/** Track every form field for dirty navigation and stable retries. */ () => this.model(),
	)
	readonly errors = computed(
		/** Validate the complete draft reactively without mutating any input. */ () => {
			try {
				if (this.singleShift()) shiftFromForm(this.model())
				else scheduleFromForm(this.model(), this.isTemplate())
				return []
			} catch (error) {
				return error instanceof HcmDomainError
					? error.fieldErrors.map(
						/** Reusable-shift errors point to the same rendered interval controls. */ (item) =>
							this.singleShift() && item.field.startsWith('segments')
								? { ...item, field: 'days.0.' + item.field }
								: item,
					)
					: [{ field: 'days', code: 'invalid' }]
			}
		},
	)
	/** Return safe local validation text for one explicit field or its segment group. */
	fieldError(field: string): string {
		if (!this.submitted() && !this.controlFields().get(field)?.().touched()) return ''
		const error = [...this.errors(), ...this.serverErrors()].find(
			/** Match only this rendered path. */ (item) => item.field === field,
		)
		if (!error) return ''
		if (error.code === 'place-or-change-unpaid-break')
			return 'Place the unpaid intervals to match these minutes, or explicitly change the minutes.'
		if (error.code === 'ordered-contiguous-shift-required')
			return 'Segments must be ordered, contiguous and positive. Use an unpaid interval for a break.'
		return 'Check this value and its related fields.'
	}

	/** Map only declared rendered paths to bound Signal Form controls for blur feedback and focus. */
	private controlFields(): Map<string, () => { touched(): boolean; focusBoundControl(): void }> {
		const result = new Map<string, () => { touched(): boolean; focusBoundControl(): void }>()
		for (const name of [
			'code',
			'name',
			'description',
			'effectiveFrom',
			'effectiveTo',
			'timezoneMode',
			'fixedZone',
			'weekStartsOn',
			'minimumRestMinutes',
			'minimumRestMode',
		] as const)
			result.set(name, this.fields[name])
		for (let d = 0; d < this.model().days.length; d++) {
			const day = this.fields.days[d]
			result.set(`days.${d}.kind`, day.kind)
			result.set(`days.${d}.unpaidMinutes`, day.unpaidMinutes)
			for (let i = 0; i < this.model().days[d].segments.length; i++) {
				const segment = day.segments[i]
				if (!i) result.set(`days.${d}.segments`, segment.startTime)
				for (const field of ['startTime', 'endTime', 'endDayOffset', 'kind'] as const)
					result.set(`days.${d}.segments.${i}.${field}`, segment[field])
			}
		}
		return result
	}

	/** Add an intentionally incomplete interval for explicit user entry. */
	addSegment(index: number): void {
		this.model.update(
			/** Replace only the selected day's interval list. */ (model) => ({
				...model,
				days: model.days.map(
					/** Keep all other days unchanged. */ (day, i) =>
						i === index ? { ...day, segments: [...day.segments, segmentForm()] } : day,
				),
			}),
		)
	}
	/** Remove exactly one interval; complete validation still requires a continuous shift. */
	removeSegment(dayIndex: number, segmentIndex: number): void {
		this.model.update(
			/** Preserve unrelated input while removing the requested interval. */ (model) => ({
				...model,
				days: model.days.map(
					/** Update only the selected day. */ (day, i) => {
						if (i !== dayIndex) return day
						return {
							...day,
							segments: day.segments.filter(
								/** Remove this interval only. */ (_, j) => j !== segmentIndex,
							),
						}
					},
				),
			}),
		)
	}

	/** Explicitly copy the first day's edited pattern to the other work days. */
	copyFirstDay(): void {
		this.model.update(
			/** Clone values so subsequent day edits remain independent. */ (model) => ({
				...model,
				days: model.days.map(
					/** Apply only to already configured working days. */ (day, index) =>
						index && day.kind === 'Work'
							? { ...structuredClone(model.days[0]), weekday: day.weekday }
							: day,
				),
			}),
		)
	}

	/** Preserve the native numeric value; incomplete input remains invalid rather than becoming zero. */
	numericValue(target: EventTarget | null): number {
		const value = (target as { value?: unknown } | null)?.value
		return typeof value === 'number' ? value : Number.NaN
	}

	/** Focus a native numeric control through its rendered UI owner or a directly bound Signal Form field. */
	focusInvalid(focusNumeric: (id: string) => void): void {
		const field = this.errors()[0]?.field ?? ''
		if (field === 'minimumRestMinutes') focusNumeric('schedule-minimum-rest')
		else {
			const day = /^days\.(\d+)\.unpaidMinutes$/.exec(field)
			if (day) focusNumeric('schedule-unpaid-' + day[1])
			else this.controlFields().get(field)?.().focusBoundControl()
		}
	}
}
