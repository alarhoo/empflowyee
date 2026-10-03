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
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
	form,
	FormField,
	disabled,
	validate,
	required,
	maxLength,
	pattern,
	submit,
} from '@angular/forms/signals'
import { HttpErrorResponse } from '@angular/common/http'
import { firstValueFrom, Subject, takeUntil, type Subscription } from 'rxjs'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
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
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDateField, HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	WorkSchedulesApi,
	attendanceErrorMessage,
	attendanceReadState,
} from '@empflowyee/hcm-web-attendance-data-access'
import { IdentityApi } from '@empflowyee/hcm-web-identity-access-data-access'
import type { AttendancePolicyVersionView } from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, type HcmFieldError } from '@empflowyee/hcm-runtime-contract'
import {
	emptyPolicyForm,
	emptyPolicyRule,
	policyFromForm,
	policyFormFromVersion,
} from './policy-form'
import { SCHEDULE_PERMISSION, SCHEDULE_ROUTE } from './schedule-form'

/** Dedicated native policy editor; every enabled rule is explicit and validated before HTTP. */
@Component({
	selector: 'ef-hcm-attendance-policy-editor',
	imports: [
		FormField,
		Button,
		CheckBox,
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
		HcmDynamicPage,
		HcmDateField,
		HcmDiscardDialog,
	],
	templateUrl: './policy-editor.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendancePolicyEditor {
	private readonly api = inject(WorkSchedulesApi)
	private readonly identity = inject(IdentityApi)
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	readonly runtime = inject(HcmRuntimeStore)
	readonly id = this.route.snapshot.paramMap.get('id')
	readonly model = signal(emptyPolicyForm())
	readonly source = signal<AttendancePolicyVersionView | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly submitted = signal(false)
	readonly serverErrors = signal<HcmFieldError[]>([])
	readonly accounts = signal<{ id: string; name: string }[]>([])
	readonly accountSearch = signal('')
	readonly accountMessage = signal('')
	private generation = 0
	private accountGeneration = 0
	private read?: Subscription
	private readonly changed = new Subject<void>()
	readonly subjects = [
		'Correction',
		'Adjustment',
		'Overtime',
		'Roster',
		'Override',
		'AnomalyWaiver',
		'PeriodReopen',
	]
	readonly numericFields = [
		{ id: 'graceInMinutes', label: 'Grace in minutes' },
		{ id: 'graceOutMinutes', label: 'Grace out minutes' },
	] as const
	readonly draft = new HcmDraft(
		/** Track exact rule input and preserve retry identity after uncertainty. */ () => this.model(),
	)
	readonly errors = computed(
		/** Reuse the same authoritative parser during correction and submission. */ () => {
			try {
				policyFromForm(this.model())
				return []
			} catch (error) {
				return error instanceof HcmDomainError
					? error.fieldErrors
					: [{ field: 'approvalRules', code: 'invalid' }]
			}
		},
	)
	readonly fields = form(
		this.model,
		/** Static limits supplement the universal cross-field validator. */ (path) => {
			disabled(path, {
				when: /** Freeze a command while waiting for its receipt. */ () => this.draft.saving(),
			})
			required(path.code)
			maxLength(path.code, 40)
			pattern(path.code, /^[A-Z][A-Z0-9_-]*$/)
			required(path.name)
			maxLength(path.name, 120)
			pattern(path.name, /\S/)
			required(path.effectiveFrom)
			validate(
				path,
				/** Block submission until every active policy rule is valid. */ () =>
					this.errors().length
						? { kind: 'policy', message: 'Correct the highlighted policy fields.' }
						: null,
			)
		},
	)
	/** Cancel old-context reads and private drafts on session changes. */
	constructor() {
		effect(
			/** Observe verified runtime authority before initializing an editor. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear old tenant data before issuing new reads. */ () => {
						this.generation++
						this.accountGeneration++
						this.changed.next()
						this.read?.unsubscribe()
						this.model.set(emptyPolicyForm())
						this.source.set(null)
						this.accounts.set([])
						this.accountMessage.set('')
						this.submitted.set(false)
						this.serverErrors.set([])
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
			/** Release in-flight reads and pending navigation decisions. */ () => {
				this.generation++
				this.changed.next()
				this.read?.unsubscribe()
				this.draft.release()
			},
		)
	}
	/** Map only rendered fields to controls, keeping arbitrary server paths out of form traversal. */
	private controls(): Map<string, () => { touched(): boolean; focusBoundControl(): void }> {
		const result = new Map<string, () => { touched(): boolean; focusBoundControl(): void }>()
		for (const key of [
			'code',
			'name',
			'effectiveFrom',
			'effectiveTo',
			'graceInMinutes',
			'graceOutMinutes',
			'rounding',
			'roundingIncrementMinutes',
			'roundingDirection',
			'minimumRestMinutes',
			'minimumRestMode',
		] as const)
			result.set(key, this.fields[key])
		result.set('overtime.enabled', this.fields.overtimeEnabled)
		result.set('overtime.qualification', this.fields.qualification)
		result.set('overtime.capMinutes', this.fields.capMinutes)
		result.set('overtime.preapprovalRequired', this.fields.preapprovalRequired)
		for (let i = 0; i < this.model().approvalRules.length; i++) {
			const rule = this.fields.approvalRules[i]
			for (const key of ['subjectType', 'stage', 'independent'] as const)
				result.set(`approvalRules.${i}.${key}`, rule[key])
			for (const key of ['source', 'managerLevel', 'functionCode', 'accountId'] as const)
				result.set(`approvalRules.${i}.candidateRule.${key}`, rule[key])
		}
		return result
	}
	/** Show persistent field feedback after blur or a save attempt and clear it as input is corrected. */
	fieldError(field: string): string {
		if (!this.submitted() && !this.controls().get(field)?.().touched()) return ''
		const error = [...this.errors(), ...this.serverErrors()].find(
			/** Match exactly one declared rendered field. */ (item) => item.field === field,
		)
		if (!error) return ''
		const messages: Record<string, string> = {
			'independent-overtime-manager-required':
				'Enabled overtime requires an independent Line Manager or Manager Level approval rule.',
			'noncontiguous-stages':
				'Approval stages must start at 1 and be consecutive for each subject.',
			'independent-approval-required': 'This subject requires independent approval.',
		}
		return messages[error.code] ?? 'Check this value and its related policy rules.'
	}
	/** Load an exact Draft; new policies begin empty rather than borrowing another configuration. */
	load(): void {
		this.read?.unsubscribe()
		this.message.set('')
		this.state.set('loading')
		if (!this.runtime.context()?.access.permissions.includes(SCHEDULE_PERMISSION + 'draft')) {
			this.state.set('denied')
			return
		}
		if (!this.id) {
			this.state.set('content')
			return
		}
		const version = this.route.snapshot.queryParamMap.get('version')
		if (!version) {
			this.state.set('unavailable')
			this.message.set('Select an exact policy version.')
			return
		}
		this.read = this.api
			.detail(this.id, version, 'Policy')
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Published history stays read-only. */ (source) => {
					if (source.state !== 'Draft') {
						this.state.set('unavailable')
						this.message.set('Create a successor to change this published policy.')
						return
					}
					this.source.set(source)
					this.model.set(policyFormFromVersion(source))
					this.draft.markClean()
					this.state.set('content')
				},
				error: /** Clear unavailable reads without fabricating a policy. */ (error) => {
					this.state.set(attendanceReadState(error))
					this.message.set(attendanceErrorMessage(error))
				},
			})
	}
	/** Append one incomplete rule for explicit user entry. */
	addRule(): void {
		this.model.update(
			/** Keep existing slots unchanged. */ (value) => ({
				...value,
				approvalRules: [...value.approvalRules, emptyPolicyRule()],
			}),
		)
	}
	/** Remove only the selected slot; the contract rechecks stage continuity. */
	removeRule(index: number): void {
		this.model.update(
			/** Preserve unrelated typed policy fields. */ (value) => ({
				...value,
				approvalRules: value.approvalRules.filter(
					/** Match one current slot position. */ (_, i) => i !== index,
				),
			}),
		)
	}
	/** Query the Identity owner's authorized account picker; denial does not fall back to free-text IDs. */
	hasAccount(id: string): boolean {
		return this.accounts().some(
			/** Compare only an authorized loaded reference. */ (account) => account.id === id,
		)
	}
	/** Query the Identity owner's authorized account picker; denial does not fall back to free-text IDs. */
	findAccounts(): void {
		const generation = ++this.accountGeneration
		this.accountMessage.set('')
		this.accounts.set([])
		this.identity
			.list({ q: this.accountSearch(), enabled: 'true', sort: 'displayName:asc' })
			.pipe(takeUntilDestroyed(this.destroy), takeUntil(this.changed))
			.subscribe({
				next: /** Project only identifiers and display names needed by this picker. */ (page) => {
					if (generation !== this.accountGeneration) return
					this.accounts.set(
						page.items.map(
							/** Exclude email and identity administration metadata. */ (item) => ({
								id: item.id,
								name: item.displayName,
							}),
						),
					)
					if (page.nextCursor) this.accountMessage.set('More accounts match. Narrow the search.')
				},
				error: /** Keep missing Identity read permission explicit. */ () => {
					if (generation === this.accountGeneration)
						this.accountMessage.set(
							'Account choices unavailable. Current Identity account read permission is required.',
						)
				},
			})
	}
	/** Save only a valid complete rule set using the original retry key after uncertain delivery. */
	async save(): Promise<void> {
		if (this.draft.saving() || this.state() !== 'content') return
		this.submitted.set(true)
		this.serverErrors.set([])
		this.draft.error.set('')
		const generation = this.generation
		let saved: AttendancePolicyVersionView | undefined
		await submit(this.fields, {
			onInvalid: /** Focus the first actual field and retain a form-level explanation. */ () => {
				this.draft.error.set('Complete the highlighted policy fields.')
				this.controls()
					.get(this.errors()[0]?.field ?? '')?.()
					.focusBoundControl()
			},
			action:
			/** Keep the source revision and command body fixed until the response arrives. */ async () => {
				const body = policyFromForm(this.model()),
					source = this.source(),
					key = this.draft.key({ body, source })
				this.draft.saving.set(true)
				try {
					saved = await firstValueFrom(
						(source
							? this.api.update(source, body, key, 'Policy')
							: this.api.create(body, key, 'Policy')
						).pipe(takeUntil(this.changed), takeUntilDestroyed(this.destroy)),
					)
					return undefined
				} catch (error) {
					if (generation !== this.generation || this.destroy.destroyed) return undefined
					this.draft.error.set(attendanceErrorMessage(error))
					if (error instanceof HttpErrorResponse && Array.isArray(error.error?.fieldErrors))
						this.serverErrors.set(error.error.fieldErrors)
					return { kind: 'server', message: 'The save could not be confirmed.' }
				} finally {
					if (generation === this.generation) this.draft.saving.set(false)
				}
			},
		})
		if (!saved || generation !== this.generation || this.destroy.destroyed) return
		this.draft.markClean()
		await this.router.navigate([SCHEDULE_ROUTE, saved.id], {
			queryParams: { family: 'Policy', version: saved.versionId },
		})
	}
	/** Navigate through the same dirty guard used by shell navigation. */
	cancel(): void {
		void this.router.navigate([SCHEDULE_ROUTE], { queryParams: { family: 'Policy' } })
	}
	/** Keep unresolved writes and private draft rules protected during navigation. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}
	/** Let the browser warn before losing unconfirmed input. */
	@HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
		if (this.draft.dirty() || this.draft.saving()) event.preventDefault()
	}
}
