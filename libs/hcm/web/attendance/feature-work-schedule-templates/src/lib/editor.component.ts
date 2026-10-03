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
	ScheduleTemplatesApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import type { ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import {
	emptyScheduleForm,
	formFromDefaults,
	formFromVersion,
	scheduleFromForm,
	TEMPLATE_ROUTE,
	TEMPLATE_PERMISSION,
} from './schedule-form'

/** Routed complete-pattern editor; no incomplete proposal can become a reusable template. */
@Component({
	selector: 'ef-hcm-schedule-template-editor',
	imports: [Button, MessageStrip, HcmDynamicPage, HcmDiscardDialog, SchedulePatternFields],
	templateUrl: './editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleTemplateEditor extends SchedulePatternState {
	private readonly api = inject(ScheduleTemplatesApi)
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	readonly runtime = inject(HcmRuntimeStore)
	private read?: Subscription
	private readonly contextChanged = new Subject<void>()
	private contextGeneration = 0
	private readonly pattern = viewChild(SchedulePatternFields)
	readonly source = signal<ScheduleVersionView | null>(null)
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
		effect(
			/** Context changes invalidate loaded source and private form state. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Dispose prior requests before starting the current context's read. */ () => {
						this.read?.unsubscribe()
						this.contextGeneration++
						this.contextChanged.next()
						this.source.set(null)
						this.model.set(emptyScheduleForm())
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
		if (!this.runtime.context()?.access.permissions.includes(`${TEMPLATE_PERMISSION}draft`)) {
			this.state.set('denied')
			return
		}
		if (this.id) {
			const version = this.route.snapshot.queryParamMap.get('version')
			if (!version) {
				this.state.set('unavailable')
				this.message.set('Select an exact draft version from the template detail.')
				return
			}
			this.read = this.api
				.detail(this.id, version)
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
						this.model.set(formFromVersion(source))
						this.draft.markClean()
						this.state.set('content')
					},
					error: /** Keep the read failure explicit. */ (error) => this.failRead(error),
				})
		} else
			this.read = this.api
				.defaults()
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Keep unpaid targets unplaced until the user completes the pattern. */ (
						defaults,
					) => {
						this.model.set(formFromDefaults(defaults))
						this.draft.markClean()
						this.state.set('content')
					},
					error: /** Missing configuration blocks creation rather than inventing values. */ (
						error,
					) => this.failRead(error),
				})
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
		let saved: ScheduleVersionView | undefined
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
				const body = scheduleFromForm(this.model()),
					source = this.source()
				const key = this.draft.key({ source, body })
				const call = source ? this.api.update(source, body, key) : this.api.create(body, key)
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
		await this.router.navigate([TEMPLATE_ROUTE, saved.id], {
			queryParams: { version: saved.versionId },
		})
	}

	/** Leave through the route guard, which owns the single discard confirmation. */
	cancel(): void {
		void this.router.navigateByUrl(TEMPLATE_ROUTE)
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
