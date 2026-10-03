import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	input,
	signal,
} from '@angular/core'
import { form, FormField, validate, submit } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { HcmDateField } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore, HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	WorkSchedulesApi,
	attendanceErrorMessage,
} from '@empflowyee/hcm-web-attendance-data-access'
import {
	parseWorkdayQuery,
	type WorkdayView,
	type HolidayReferenceOption,
	type HolidayEmploymentOptions,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Explain stored workday evidence inside the owning native ObjectPage without hidden resolution commands. */
@Component({
	selector: 'ef-hcm-workday-inspector',
	imports: [
		FormField,
		Button,
		DatePicker,
		Form,
		FormItem,
		Input,
		Label,
		MessageStrip,
		Select,
		Option,
		Text,
		Title,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		ObjectStatusComponent,
		HcmDateField,
		HcmDatePipe,
	],
	templateUrl: './workday-inspector.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkdayInspector {
	readonly from = input.required<string>()
	readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(WorkSchedulesApi)
	private readonly destroy = inject(DestroyRef)
	private read?: Subscription
	private generation = 0
	private workerGeneration = 0
	private searchGeneration = 0
	readonly model = signal({ employmentId: '', from: '', to: '' })
	readonly search = signal('')
	readonly workers = signal<HolidayReferenceOption[]>([])
	readonly context = signal<HolidayEmploymentOptions | null>(null)
	readonly items = signal<WorkdayView[]>([])
	readonly pending = signal(false)
	readonly loaded = signal(false)
	readonly message = signal('')
	readonly lookupMessage = signal('')
	readonly submitted = signal(false)
	private readonly loadedInput = signal('')
	readonly current = computed(
		/** Hide evidence immediately when the selected employment or range changes. */ () =>
			this.loadedInput() === JSON.stringify(this.model()),
	)
	readonly errors = computed(
		/** Retain the API's exact required employment and bounded date restrictions. */ () => {
			try {
				parseWorkdayQuery(new URLSearchParams(this.model()))
				return []
			} catch (error) {
				return error instanceof HcmDomainError ? error.fieldErrors : []
			}
		},
	)
	readonly fields = form(
		this.model,
		/** The same closed query parser controls whether a read may be issued. */ (path) => {
			validate(
				path,
				/** Display invalid query fields before HTTP. */ () =>
					this.errors().length
						? {
							kind: 'range',
							message: 'Choose an employment and a valid range of at most 366 dates.',
						}
						: null,
			)
		},
	)
	/** Initialize the explicit source date and dispose all pending reads with the containing page. */
	ngOnInit(): void {
		this.model.set({ employmentId: '', from: this.from(), to: this.from() })
		this.findWorkers()
		this.destroy.onDestroy(
			/** Cancel callbacks after the source detail is destroyed. */ () => {
				this.generation++
				this.read?.unsubscribe()
			},
		)
	}
	/** Give each invalid rendered field its own persistent feedback. */
	error(field: 'employmentId' | 'from' | 'to'): string {
		if (!this.submitted() && !this.fields[field]().touched()) return ''
		return this.errors().some(
			/** Match only the exact declared control. */ (error) => error.field === field,
		)
			? {
				employmentId: 'Choose an employment.',
				from: 'Enter a valid start date.',
				to: 'Enter an end date within 366 days, on or after the start.',
			}[field]
			: ''
	}
	/** Search minimal authorized worker references; narrowing handles a truncated result set. */
	findWorkers(): void {
		const generation = ++this.searchGeneration
		this.lookupMessage.set('')
		this.api
			.referenceOptions('workers', this.search(), this.model().from)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Keep only the current query's authorized references. */ (page) => {
					if (generation !== this.searchGeneration) return
					this.workers.set(page.items)
					if (page.hasMore) this.lookupMessage.set('More workers match. Narrow your search.')
				},
				error: /** Preserve a visible retryable lookup failure. */ () => {
					if (generation === this.searchGeneration)
						this.lookupMessage.set('Worker choices unavailable. Check the start date and retry.')
				},
			})
	}
	/** Keep multiple employments distinct and discard the prior worker's evidence immediately. */
	selectWorker(worker: string): void {
		const generation = ++this.workerGeneration
		this.context.set(null)
		this.model.update(
			/** Clear prior selection before requesting new context. */ (value) => ({
				...value,
				employmentId: '',
			}),
		)
		if (!worker) return
		this.api
			.employmentOptions(worker, this.model().from)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Ignore late responses for replaced workers. */ (context) => {
					if (generation === this.workerGeneration) this.context.set(context)
				},
				error: /** Do not show an old worker's lookup error. */ () => {
					if (generation === this.workerGeneration)
						this.lookupMessage.set('Employment choices unavailable.')
				},
			})
	}
	/** Request an authorized stored projection and retain explicit unavailable days. */
	async inspect(): Promise<void> {
		this.submitted.set(true)
		this.message.set('')
		await submit(this.fields, {
			onInvalid: /** Focus the first invalid declared query field. */ () => {
				const field = this.errors()[0]?.field
				if (field === 'employmentId' || field === 'from' || field === 'to')
					this.fields[field]().focusBoundControl()
			},
			action:
			/** The data-access call is read-only and cannot materialize workdays. */ async () => {
				this.read?.unsubscribe()
				const generation = ++this.generation,
					input = JSON.stringify(this.model())
				this.items.set([])
				this.loaded.set(false)
				this.pending.set(true)
				this.read = this.api
					.workdays(parseWorkdayQuery(new URLSearchParams(this.model())))
					.pipe(takeUntilDestroyed(this.destroy))
					.subscribe({
						next: /** Show only the exact range that produced this response. */ (page) => {
							if (generation !== this.generation) return
							if (input !== JSON.stringify(this.model())) {
								this.pending.set(false)
								return
							}
							this.items.set(page.items)
							this.loadedInput.set(input)
							this.loaded.set(true)
							this.pending.set(false)
						},
						error: /** Clear old evidence after authorization loss or service failure. */ (
							error,
						) => {
							if (generation !== this.generation) return
							this.pending.set(false)
							this.message.set(attendanceErrorMessage(error))
						},
					})
				return undefined
			},
		})
	}
	/** Format source-local date and time without shifting it into the viewer's timezone. */
	local(value: string): string {
		return (
			this.runtime.formatTimestamp(value.slice(0, 10), true) +
			' ' +
			this.runtime.formatWallTime(value.slice(11))
		)
	}
	/** Preserve exact fractional minutes by presenting any remainder as seconds. */
	duration(value: string): string {
		const milliseconds = BigInt(value),
			minutes = milliseconds / 60000n,
			remainder = milliseconds % 60000n
		return (
			minutes.toString() +
			' min' +
			(remainder ? ' ' + (Number(remainder) / 1000).toString() + ' sec' : '')
		)
	}
	/** Explain safe durable outcome codes without claiming a missing result is a rest day. */
	unavailable(code: string): string {
		const messages: Record<string, string> = {
			NotResolved:
				'No published workday is available. Configure and assign the required sources, then wait for resolution.',
			ResolutionPending: 'Resolution is queued or running. Refresh after the worker completes.',
			ResolutionFailed:
				'Resolution could not complete. An authorized administrator must review the failed work.',
			InputChanged:
				'Source inputs changed before resolution completed. A new reviewed resolution is required.',
		}
		return messages[code] ?? 'Workday unavailable: ' + code
	}
}
