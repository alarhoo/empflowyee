import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	computed,
	inject,
	input,
	signal,
} from '@angular/core'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import type { Observable } from 'rxjs'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { JobCatalogueApi } from '@empflowyee/hcm-web-job-architecture-data-access'
import type {
	CatalogueVersionDto,
	JobProfileVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { CatalogueDialog } from './catalogue-dialog'
import { isoToday } from './labels'

export type LifecycleMode = 'new-draft' | 'submit' | 'publish'
export type LifecycleTarget =
	| { type: 'catalogue'; version: CatalogueVersionDto }
	| { type: 'profile'; version: JobProfileVersionDto }

export interface LifecycleRequest {
	mode: LifecycleMode
	target: LifecycleTarget
}

/** The version a lifecycle command returns. */
export type LifecycleResult = CatalogueVersionDto | JobProfileVersionDto

/** Focused Dialog to create a draft successor, submit a draft or publish a reviewed version. */
@Component({
	selector: 'ef-hcm-job-catalogue-lifecycle-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		DatePicker,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './lifecycle-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifecycleDialog extends CatalogueDialog<LifecycleResult> implements OnInit {
	readonly request = input.required<LifecycleRequest>()
	private readonly api = inject(JobCatalogueApi)
	readonly model = signal({ changeSummary: '', reason: '' })
	readonly effectiveFrom = signal('')
	readonly dateInvalid = signal(false)
	readonly mode = computed(/** Mode. */ () => this.request().mode)
	readonly catalogue = computed(
		/** Catalogue target. */ () => this.request().target.type === 'catalogue',
	)
	readonly subject = computed(
		/** The version named in titles. */ () => {
			const target = this.request().target
			return target.type === 'catalogue'
				? `catalogue version ${target.version.versionNumber}`
				: `${target.version.profileName} version ${target.version.versionNumber}`
		},
	)
	readonly title = computed(
		/** Name the operation and target. */ () =>
			({
				'new-draft': `New draft from ${this.subject()}`,
				submit: `Submit ${this.subject()} for review`,
				publish: `Publish ${this.subject()}`,
			})[this.mode()],
	)
	readonly confirmLabel = computed(
		/** Name the command. */ () =>
			({ 'new-draft': 'Create draft', submit: 'Submit', publish: 'Publish' })[this.mode()],
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.changeSummary, {
				when: /** Catalogue drafts summarize the change. */ () =>
					this.mode() === 'new-draft' && this.catalogue(),
			})
			pattern(path.changeSummary, /^(|.*\S.*)$/s)
			maxLength(path.changeSummary, 500)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ ...this.model(), effectiveFrom: this.effectiveFrom() }),
	)

	/** Start empty; publication defaults to today. */
	ngOnInit(): void {
		this.effectiveFrom.set(this.mode() === 'publish' ? isoToday() : '')
		this.draft.markClean()
	}

	/** Read the DatePicker's timezone-free value. */
	setDate(value: string): void {
		this.effectiveFrom.set(value)
	}

	/** Validate and submit exactly one lifecycle command. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [this.fields.changeSummary, this.fields.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		this.dateInvalid.set(
			this.mode() === 'publish' && !/^\d{4}-\d{2}-\d{2}$/.test(this.effectiveFrom()),
		)
		if (this.dateInvalid()) return
		const reason = this.model().reason.trim()
		const target = this.request().target
		const version = target.version
		/** A retry key bound to the mode, version and body. */
		const key = (body: unknown) => this.draft.key({ mode: this.mode(), id: version.id, body })
		let call: Observable<LifecycleResult>
		if (this.mode() === 'new-draft') {
			if (target.type === 'catalogue') {
				const body = {
					basedOnVersionId: version.id,
					changeSummary: this.model().changeSummary.trim(),
					reason,
				}
				call = this.api.createVersion(target.version.catalogueId, body, key(body))
			} else {
				const body = { basedOnVersionId: version.id, reason }
				call = this.api.createProfileVersion(target.version.profileId, body, key(body))
			}
		} else if (this.mode() === 'submit') {
			const body = { expectedRevision: version.revision, reason }
			call =
				target.type === 'catalogue'
					? this.api.submitVersion(version.id, body, key(body))
					: this.api.submitProfileVersion(version.id, body, key(body))
		} else {
			const body = {
				effectiveFrom: this.effectiveFrom(),
				expectedRevision: version.revision,
				reason,
			}
			call =
				target.type === 'catalogue'
					? this.api.publishVersion(version.id, body, key(body))
					: this.api.publishProfileVersion(version.id, body, key(body))
		}
		this.submit(call)
	}
}
