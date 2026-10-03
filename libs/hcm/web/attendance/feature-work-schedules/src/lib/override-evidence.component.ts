import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { HttpErrorResponse } from '@angular/common/http'
import { form, FormField, validate, submit, disabled } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { firstValueFrom, Subject, takeUntil } from 'rxjs'
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	WorkSchedulesApi,
	attendanceErrorMessage,
} from '@empflowyee/hcm-web-attendance-data-access'
import { parseAttendanceEvidenceStage } from '@empflowyee/hcm-attendance-contract'
import { EVIDENCE_MAX_ATTACHMENTS, type EvidenceFileView } from '@empflowyee/hcm-documents-contract'

/** Native file selection is transient; only server-admitted references leave this section. */
@Component({
	selector: 'ef-override-evidence',
	imports: [
		FormField,
		FileUploader,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Button,
		Text,
		MessageStrip,
		ObjectStatusComponent,
	],
	templateUrl: './override-evidence.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverrideEvidenceSection {
	readonly target = input.required<{ employmentId: string; workDate: string; sourceId?: string }>()
	readonly inactive = input(false)
	readonly admitted = output<string[]>()
	readonly pending = output<boolean>()
	private readonly uploader = viewChild<FileUploader>('uploader')
	private readonly api = inject(WorkSchedulesApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private readonly changed = new Subject<void>()
	private generation = 0
	private key: string | null = null
	readonly model = signal({ classification: '' })
	readonly file = signal<File | null>(null)
	readonly items = signal<EvidenceFileView[]>([])
	readonly busy = signal(false)
	readonly loading = signal(false)
	readonly uncertain = signal(false)
	readonly attempted = signal(false)
	readonly message = signal('')
	readonly fileError = signal('')
	readonly classifications = ['General', 'Confidential', 'Restricted'] as const
	readonly available = computed(
		/** Use runtime grants for presentation only; APIs always reauthorize. */ () =>
			this.classifications.filter(
				/** Show only explicit classification choices. */ (value) =>
					this.runtime
						.context()
						?.access.permissions.includes(
							'hcm.attendance.work-schedules.evidence.' + value.toLowerCase(),
						),
			),
	)
	readonly fields = form(
		this.model,
		/** Apply explicit classification validation to the native Select. */ (path) => {
			disabled(path, {
				when: /** Preserve exact retry input while the request outcome is unknown. */ () =>
					this.inactive() || this.busy() || this.uncertain(),
			})
			validate(
				path.classification,
				/** An upload has no implicit privacy classification. */ ({ value }) =>
					this.available().some(/** Match an exact granted enum. */ (item) => item === value())
						? null
						: { kind: 'classification', message: 'Choose an evidence classification.' },
			)
		},
	)
	/** Cancel late private responses on source, tenant or persona changes and clear file memory. */
	constructor() {
		effect(
			/** Bind private state to the exact runtime identity and dated source. */ () => {
				const target = this.target(),
					context = this.runtime.context()
				untracked(
					/** Reset before any newly authorized metadata is read. */ () => {
						this.generation++
						this.changed.next()
						this.file.set(null)
						this.items.set([])
						this.model.set({ classification: '' })
						this.key = null
						this.busy.set(false)
						this.uncertain.set(false)
						this.fileError.set('')
						this.message.set('')
						this.pending.emit(false)
						if (context && target.sourceId) void this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Stop requests before detached callbacks can expose private state. */ () => {
				this.generation++
				this.changed.next()
				this.changed.complete()
			},
		)
	}
	/** Reload source-bound references with field filtering performed by the server. */
	async load(): Promise<void> {
		const id = this.target().sourceId,
			generation = this.generation
		if (!id) return
		this.loading.set(true)
		this.message.set('')
		try {
			const rows = await firstValueFrom(
				this.api.evidence(id).pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
			)
			if (generation === this.generation) this.items.set(rows)
		} catch (error) {
			if (generation === this.generation) this.message.set(attendanceErrorMessage(error))
		} finally {
			if (generation === this.generation) this.loading.set(false)
		}
	}
	/** Validate native file selection before upload without claiming client checks prove file safety. */
	choose(event: Event): void {
		const file = (event.target as HTMLElement & { files: FileList | null }).files?.item(0) ?? null
		this.key = null
		this.fileError.set('')
		this.message.set('')
		this.file.set(file)
		if (
			file &&
			(file.size < 1 ||
				file.size > 10485760 ||
				file.name.length > 200 ||
				/[\\/\p{Cc}]/u.test(file.name) ||
				!/\.(pdf|png|jpe?g)$/i.test(file.name) ||
				!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type))
		)
			this.fileError.set(
				'Choose a nonempty PDF, PNG or JPEG up to 10 MiB, with a filename of at most 200 characters.',
			)
		this.pending.emit(!!file)
	}
	/** Clear a rejected native selection; the user must choose a valid file or discard it. */
	reject(): void {
		this.file.set(null)
		this.key = null
		this.fileError.set('Choose a file no larger than 10 MiB.')
		this.pending.emit(false)
	}
	/** Discard only unsubmitted local bytes; admitted references remain available for source creation. */
	clear(): void {
		if (this.busy() || this.uncertain()) return
		this.file.set(null)
		this.key = null
		this.fileError.set('')
		this.message.set('')
		this.pending.emit(false)
	}
	/** Stage actual bytes with a retained key and add the admitted reference only after committed success. */
	async upload(): Promise<void> {
		this.attempted.set(true)
		if (this.inactive() || this.busy() || this.target().sourceId) return
		if (!this.file()) {
			this.fileError.set('Choose a file before uploading.')
			void this.uploader()?.elementRef.nativeElement.focus()
			return
		}
		if (this.fileError()) {
			void this.uploader()?.elementRef.nativeElement.focus()
			return
		}
		await submit(this.fields, {
			action: /** Keep transport uncertainty separate from clean admission. */ async () => {
				const file = this.file(),
					target = this.target(),
					generation = this.generation
				if (!file) return undefined
				if (this.items().length >= EVIDENCE_MAX_ATTACHMENTS) {
					this.message.set('A draft supports up to 100 evidence files.')
					return undefined
				}
				const input = parseAttendanceEvidenceStage({
					employmentId: target.employmentId,
					workDate: target.workDate,
					purpose: 'AttendanceEvidence',
					classification: this.model().classification,
				})
				this.busy.set(true)
				this.pending.emit(true)
				this.message.set('')
				this.key ??= crypto.randomUUID()
				try {
					const result = await firstValueFrom(
						this.api
							.stageEvidence(input, file, this.key)
							.pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
					)
					if (generation !== this.generation) return undefined
					this.items.update(
						/** Retain previous independently admitted references. */ (rows) => [
							...rows,
							{ ...result, filename: file.name, sizeBytes: file.size },
						],
					)
					this.admitted.emit(
						this.items().map(
							/** Only opaque server references enter the source draft. */ (item) => item.id,
						),
					)
					this.file.set(null)
					this.key = null
					this.uncertain.set(false)
					this.pending.emit(false)
				} catch (error) {
					if (generation !== this.generation) return undefined
					this.uncertain.set(
						!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500,
					)
					this.message.set(attendanceErrorMessage(error))
				} finally {
					if (generation === this.generation) this.busy.set(false)
				}
				return undefined
			},
		})
	}
	/** Deliver authorized bytes as an attachment using the existing browser download primitive. */
	async download(item: EvidenceFileView): Promise<void> {
		const generation = this.generation
		this.message.set('')
		this.busy.set(true)
		try {
			const blob = await firstValueFrom(
				this.api
					.evidenceContent(item.id)
					.pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
			)
			if (generation !== this.generation) return
			const url = URL.createObjectURL(blob),
				link = document.createElement('a')
			link.href = url
			link.download = item.filename
			link.click()
			setTimeout(
				/** Release the transient URL once the browser has started saving. */ () =>
					URL.revokeObjectURL(url),
				1000,
			)
		} catch (error) {
			if (generation === this.generation) this.message.set(attendanceErrorMessage(error))
		} finally {
			if (generation === this.generation) this.busy.set(false)
		}
	}
}
