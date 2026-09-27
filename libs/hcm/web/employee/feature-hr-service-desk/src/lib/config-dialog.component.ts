import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HrServiceDeskApi, hrServiceErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import {
	HR_AUDIENCES,
	HR_CATEGORIES,
	HR_PRIORITIES,
	type HrConfigKind,
	type HrPriority,
	type HrServiceConfigDto,
	type HrServiceLevelPolicyDto,
	type HrServiceMembershipDto,
	type HrServiceRequestTypeDto,
	type HrServiceTeamDto,
	type PriorityTargets,
} from '@empflowyee/hcm-employee-contract'
import { CATEGORY_LABELS, CONFIG_LABELS, PRIORITY_LABELS } from './labels'
import { HrOptionBox, type OptionRef } from './option-box.component'

/** A configuration create (no item) or edit. */
export interface ConfigDialogInput {
	kind: HrConfigKind
	item: HrServiceConfigDto | null
}

/** Default minute targets of a new service level, copied from the standard policy. */
const DEFAULT_TARGETS: PriorityTargets = {
	P1: { firstResponse: 240, resolution: 1440 },
	P2: { firstResponse: 1440, resolution: 4320 },
	P3: { firstResponse: 2880, resolution: 7200 },
	P4: { firstResponse: 4320, resolution: 14400 },
}

/** Focused Dialog to create or edit a team, membership, request type or service level. */
@Component({
	selector: 'ef-hcm-hr-config-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Input,
		TextArea,
		Text,
		CheckBox,
		StepInput,
		MessageStrip,
		HcmDiscardDialog,
		HrOptionBox,
	],
	templateUrl: './config-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigDialog implements OnInit, OnDestroy {
	readonly input = input.required<ConfigDialogInput>()
	readonly saved = output<{ message: string; item: HrServiceConfigDto }>()
	readonly closed = output<void>()
	private readonly api = inject(HrServiceDeskApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly priorities = HR_PRIORITIES
	readonly priorityLabels = PRIORITY_LABELS
	readonly categories = HR_CATEGORIES
	readonly categoryLabels = CATEGORY_LABELS
	readonly audiences = HR_AUDIENCES
	readonly touched = signal(false)
	readonly team = signal<OptionRef | null>(null)
	readonly person = signal<OptionRef | null>(null)
	readonly targets = signal<PriorityTargets>(structuredClone(DEFAULT_TARGETS))
	readonly model = signal({
		code: '',
		name: '',
		description: '',
		isActive: true,
		memberRole: 'Agent',
		category: 'General',
		audience: 'Employee',
		serviceLevelCode: 'standard',
		defaultPriority: 'P3',
		sortOrder: 0,
		pauseWhileWaiting: true,
		reopenWindowDays: 7,
		publish: false,
		reason: '',
	})
	readonly kind = computed(/** The configuration kind. */ () => this.input().kind)
	readonly item = computed(/** The edited item, if any. */ () => this.input().item)
	readonly creating = computed(/** No item means create. */ () => !this.item())
	readonly usesName = computed(/** Memberships have no name. */ () => this.kind() !== 'memberships')
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
			required(path.code, {
				when: /** New coded items. */ () => this.creating() && this.kind() !== 'memberships',
			})
			pattern(path.code, /^$|^[a-z][a-z0-9-_]{1,39}$/)
			required(path.name, { when: /** Named kinds. */ () => this.usesName() })
			maxLength(path.name, 100)
			maxLength(path.description, 500)
			required(path.serviceLevelCode, {
				when: /** Request types. */ () => this.kind() === 'request-types',
			})
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({
			model: this.model(),
			team: this.team(),
			person: this.person(),
			targets: this.targets(),
		}),
	)
	readonly title = computed(
		/** Dialog title. */ () => {
			const singular = CONFIG_LABELS[this.kind()].singular
			return this.creating() ? `New ${singular}` : `Edit ${singular}`
		},
	)
	readonly frozen = computed(
		/** Published or retired service levels cannot change. */ () =>
			this.kind() === 'service-levels' &&
			!!this.item() &&
			(this.item() as HrServiceLevelPolicyDto).status !== 'Draft',
	)

	/** Prefill from the edited item. */
	ngOnInit(): void {
		const item = this.item()
		if (item) this.prefill(item)
		this.draft.markClean()
	}

	/** Copy the edited item into the form. */
	private prefill(item: HrServiceConfigDto): void {
		const kind = this.kind()
		if (kind === 'teams') {
			const team = item as HrServiceTeamDto
			this.model.update(
				/** Team. */ (v) => ({
					...v,
					code: team.code,
					name: team.name,
					description: team.description,
					isActive: team.isActive,
				}),
			)
		} else if (kind === 'memberships') {
			const member = item as HrServiceMembershipDto
			this.team.set(member.team)
			this.person.set({ id: member.account.accountId, name: member.account.name })
			this.model.update(
				/** Membership. */ (v) => ({
					...v,
					memberRole: member.memberRole,
					isActive: member.isActive,
				}),
			)
		} else if (kind === 'request-types') {
			const type = item as HrServiceRequestTypeDto
			this.team.set(type.defaultTeam)
			this.model.update(
				/** Request type. */ (v) => ({
					...v,
					code: type.code,
					name: type.name,
					description: type.description,
					isActive: type.isActive,
					category: type.category,
					audience: type.audience,
					serviceLevelCode: type.serviceLevelCode,
					defaultPriority: type.defaultPriority,
					sortOrder: type.sortOrder,
				}),
			)
		} else {
			const policy = item as HrServiceLevelPolicyDto
			this.targets.set(structuredClone(policy.targets))
			this.model.update(
				/** Service level. */ (v) => ({
					...v,
					code: policy.code,
					name: policy.name,
					pauseWhileWaiting: policy.pauseWhileWaiting,
					reopenWindowDays: policy.reopenWindowDays,
				}),
			)
		}
	}

	/** Set one minute target of a priority. */
	setTarget(priority: HrPriority, kind: 'firstResponse' | 'resolution', value: number): void {
		this.targets.update(
			/** Replace one value. */ (targets) => ({
				...targets,
				[priority]: { ...targets[priority], [kind]: Number(value) || 1 },
			}),
		)
	}

	/** Toggle a boolean model field from a CheckBox. */
	check(field: 'isActive' | 'pauseWhileWaiting' | 'publish', checked: boolean): void {
		this.model.update(/** Toggle. */ (v) => ({ ...v, [field]: checked }))
	}

	/** Set the sort order or reopen window from a StepInput. */
	step(field: 'sortOrder' | 'reopenWindowDays', value: number): void {
		this.model.update(/** Set. */ (v) => ({ ...v, [field]: Number(value) || 0 }))
	}

	/** The request body of the kind, or null when a required choice is missing. */
	private body(): Record<string, unknown> | null {
		const v = this.model()
		const item = this.item()
		const body: Record<string, unknown> = { reason: v.reason.trim() }
		if (item) body['expectedRevision'] = item.revision
		const kind = this.kind()
		if (kind !== 'memberships' && this.creating()) body['code'] = v.code.trim()
		if (kind === 'teams')
			Object.assign(body, {
				name: v.name.trim(),
				description: v.description.trim(),
				isActive: v.isActive,
			})
		else if (kind === 'memberships') {
			if (this.creating()) {
				const team = this.team()
				const person = this.person()
				if (!team || !person) return null
				Object.assign(body, { teamId: team.id, accountId: person.id })
			}
			Object.assign(body, { memberRole: v.memberRole, isActive: v.isActive })
		} else if (kind === 'request-types') {
			const team = this.team()
			if (!team) return null
			Object.assign(body, {
				name: v.name.trim(),
				description: v.description.trim(),
				category: v.category,
				audience: v.audience,
				defaultTeamId: team.id,
				serviceLevelCode: v.serviceLevelCode.trim(),
				defaultPriority: v.defaultPriority,
				sortOrder: v.sortOrder,
				isActive: v.isActive,
			})
		} else {
			Object.assign(body, {
				name: v.name.trim(),
				targets: this.targets(),
				pauseWhileWaiting: v.pauseWhileWaiting,
				reopenWindowDays: v.reopenWindowDays,
			})
			if (v.publish && !this.creating()) body['status'] = 'Published'
		}
		return body
	}

	/** Send the change, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving() || this.frozen()) return
		this.fields().markAsTouched()
		this.touched.set(true)
		const f = this.fields
		for (const field of [f.code, f.name, f.description, f.serviceLevelCode, f.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const body = this.body()
		if (!body) return
		const id = this.item()?.id ?? null
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.configure(this.kind(), id, body, this.draft.key({ kind: this.kind(), id, body }))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close after commit. */ (item) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowClose = true
					const singular = CONFIG_LABELS[this.kind()].singular
					this.saved.emit({ message: `The ${singular} was saved.`, item })
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(hrServiceErrorMessage(error))
				},
			})
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the page's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
