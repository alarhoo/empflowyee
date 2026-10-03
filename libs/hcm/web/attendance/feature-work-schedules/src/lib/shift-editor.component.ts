import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	HostListener,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { submit } from '@angular/forms/signals'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { firstValueFrom, Subject, takeUntil, type Subscription } from 'rxjs'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import {
	SchedulePatternState,
	SchedulePatternFields,
} from '@empflowyee/hcm-web-attendance-ui-schedule-pattern'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	WorkSchedulesApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import type { ShiftVersionView } from '@empflowyee/hcm-attendance-contract'
import {
	emptyShiftForm,
	formFromShift,
	shiftFromForm,
	SCHEDULE_ROUTE,
	SCHEDULE_PERMISSION,
} from './schedule-form'

/** Routed complete-pattern editor; no incomplete proposal can become a reusable shift. */
@Component({
	selector: 'ef-hcm-work-shift-editor',
	imports: [Button, MessageStrip, HcmDynamicPage, HcmDiscardDialog, SchedulePatternFields],
	templateUrl: './shift-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkShiftEditor extends SchedulePatternState {
	private readonly api = inject(WorkSchedulesApi)
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	readonly runtime = inject(HcmRuntimeStore)
	private read?: Subscription
	private readonly contextChanged = new Subject<void>()
	private contextGeneration = 0
	private readonly pattern = viewChild(SchedulePatternFields)
	readonly source = signal<ShiftVersionView | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly id = this.route.snapshot.paramMap.get('id')
	readonly timeFormat = computed(
		/** Respect the current account's clock convention while retaining seconds. */ () =>
			this.runtime.preferences().timeFormat === '12h' ? 'hh:mm:ss.SSS a' : 'HH:mm:ss.SSS',
	)

	/** Clear private draft state and cancel pending callbacks whenever verified context changes. */
	constructor() {
		super()
		this.isTemplate.set(false)
		this.singleShift.set(true)
		effect(
			/** Context changes invalidate loaded source and private form state. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Dispose prior requests before starting the current context's read. */ () => {
						this.read?.unsubscribe()
						this.contextGeneration++
						this.contextChanged.next()
						this.source.set(null)
						this.model.set(emptyShiftForm())
						this.serverErrors.set([])
						this.submitted.set(false)
						this.draft.saving.set(false)
						this.draft.error.set('')
						this.draft.markClean()
						this.state.set('loading')
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Release requests and any navigation confirmation. */ () => {
				this.read?.unsubscribe()
				this.contextGeneration++
				this.contextChanged.next()
				this.draft.release()
			},
		)
	}

	/** Load one exact draft or the persisted seed proposal; unavailable data never becomes fake defaults. */
	load(): void {
		this.read?.unsubscribe()
		this.state.set('loading')
		this.message.set('')
		if (!this.runtime.context()?.access.permissions.includes(`${SCHEDULE_PERMISSION}draft`)) {
			this.state.set('denied')
			return
		}
		if (this.id) {
			const version = this.route.snapshot.queryParamMap.get('version')
			if (!version) {
				this.state.set('unavailable')
				this.message.set('Select an exact draft version from the shift detail.')
				return
			}
			this.read = this.api
				.detail(this.id, version, 'Shift')
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Only editable drafts enter this route's form. */ (source) => {
						if (source.state !== 'Draft') {
							this.state.set('unavailable')
							this.message.set(
								'Published and retired versions are read-only. Create a successor from the detail.',
							)
							return
						}
						this.source.set(source)
						this.model.set(formFromShift(source))
						this.draft.markClean()
						this.state.set('content')
					},
					error: /** Keep the read failure explicit. */ (error) => this.failRead(error),
				})
		} else {
			this.model.set(emptyShiftForm())
			this.draft.markClean()
			this.state.set('content')
		}
	}

	/** Classify a failed initial read. */
	private failRead(error: unknown): void {
		this.message.set(attendanceErrorMessage(error))
		this.state.set(attendanceReadState(error))
	}

	/** Submit through Signal Forms while retaining the same command identity after transport uncertainty. */
	async save(): Promise<void> {
		if (this.draft.saving() || this.state() !== 'content') return
		this.submitted.set(true)
		this.serverErrors.set([])
		this.draft.error.set('')
		let saved: ShiftVersionView | undefined
		const generation = this.contextGeneration
		await submit(this.fields, {
			onInvalid: /** Focus the first contract field and keep a persistent explanation. */ () => {
				this.draft.error.set('Complete the highlighted fields before saving.')
				this.focusInvalid(
					/** Delegate numeric focus to the rendered native field owner. */ (id) =>
						this.pattern()?.focusNumeric(id),
				)
			},
			action: /** Persist or report an unconfirmed command. */ async () => {
				const body = shiftFromForm(this.model()),
					source = this.source()
				const key = this.draft.key({ source, body })
				const call = source
					? this.api.update(source, body, key, 'Shift')
					: this.api.create(body, key, 'Shift')
				this.draft.saving.set(true)
				try {
					saved = await firstValueFrom(
						call.pipe(takeUntil(this.contextChanged), takeUntilDestroyed(this.destroy)),
					)
					return undefined
				} catch (error) {
					if (generation !== this.contextGeneration || this.destroy.destroyed) return undefined
					this.draft.error.set(attendanceErrorMessage(error))
					if (error instanceof HttpErrorResponse && Array.isArray(error.error?.fieldErrors))
						this.serverErrors.set(error.error.fieldErrors)
					return { kind: 'server', message: attendanceErrorMessage(error) }
				} finally {
					if (generation === this.contextGeneration) this.draft.saving.set(false)
				}
			},
		})
		if (!saved || generation !== this.contextGeneration || this.destroy.destroyed) return
		this.draft.markClean()
		await this.router.navigate([SCHEDULE_ROUTE, saved.id], {
			queryParams: { family: 'Shift', version: saved.versionId },
		})
	}

	/** Leave through the route guard, which owns the single discard confirmation. */
	cancel(): void {
		void this.router.navigate([SCHEDULE_ROUTE], { queryParams: { family: 'Shift' } })
	}
	/** Preserve a dirty editor or an in-flight write during route navigation. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}
	/** Warn before browser unload loses an unconfirmed draft. */
	@HostListener('window:beforeunload', ['$event'])
	beforeUnload(event: BeforeUnloadEvent): void {
		if (this.draft.dirty() || this.draft.saving()) event.preventDefault()
	}
}
