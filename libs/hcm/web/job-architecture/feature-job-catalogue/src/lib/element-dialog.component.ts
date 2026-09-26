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
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { JobCatalogueApi } from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	TRACK_KINDS,
	type CatalogueElementKind,
	type CatalogueVersionDto,
	type JobFamilyNodeDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { CatalogueDialog } from './catalogue-dialog'
import { ELEMENT_LABELS, TRACK_KIND_LABELS } from './labels'

/** The editable view of an existing element. */
export interface ElementRow {
	id: string
	code: string
	name: string
	description: string
	active: boolean
	order: number
	scopeSummary?: string
}

export interface ElementDialogRequest {
	version: CatalogueVersionDto
	kind: CatalogueElementKind
	element: ElementRow | null
	/** Root families, the only possible parents (DEC-HCM2-005). */
	roots: JobFamilyNodeDto[]
	/** Preselected track, band or parent family for a new element. */
	parentId?: string
}

/** Focused Dialog to add or edit one family, track, level, band or grade of a draft version. */
@Component({
	selector: 'ef-hcm-job-catalogue-element-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		StepInput,
		CheckBox,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './element-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElementDialog extends CatalogueDialog<CatalogueVersionDto> implements OnInit {
	readonly request = input.required<ElementDialogRequest>()
	private readonly api = inject(JobCatalogueApi)
	readonly trackKinds = TRACK_KINDS
	readonly trackKindLabels = TRACK_KIND_LABELS
	readonly model = signal({
		code: '',
		name: '',
		description: '',
		scopeSummary: '',
		parent: 'none',
		trackKind: 'IndividualContributor',
		reason: '',
	})
	readonly order = signal(1)
	readonly active = signal(true)
	readonly kind = computed(/** Element kind. */ () => this.request().kind)
	readonly editing = computed(/** Edit mode. */ () => this.request().element !== null)
	readonly ordered = computed(
		/** Families and tracks use a display order; others a sequence. */ () =>
			this.kind() === 'families' || this.kind() === 'tracks',
	)
	readonly title = computed(
		/** Name the operation and target. */ () => {
			const element = this.request().element
			return element
				? `Edit ${ELEMENT_LABELS[this.kind()]} ${element.name}`
				: `Add ${ELEMENT_LABELS[this.kind()]}`
		},
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract; uniqueness stays server-side. */ (path) => {
			required(path.code, { when: /** Only on add. */ () => !this.editing() })
			pattern(path.code, /^[A-Z][A-Z0-9_]{1,39}$/)
			required(path.name)
			pattern(path.name, /\S/)
			maxLength(path.name, 100)
			maxLength(path.description, 500)
			maxLength(path.scopeSummary, 500)
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ ...this.model(), order: this.order(), active: this.active() }),
	)

	/** Start from the stored element, or defaults with the next free sequence. */
	ngOnInit(): void {
		const { element, kind, version, parentId, roots } = this.request()
		let parent = parentId ?? 'none'
		if (kind === 'levels' && parent === 'none') parent = version.tracks[0]?.id ?? 'none'
		if (kind === 'grades' && parent === 'none') parent = version.bands[0]?.id ?? 'none'
		this.model.set({
			code: element?.code ?? '',
			name: element?.name ?? '',
			description: element?.description ?? '',
			scopeSummary: element?.scopeSummary ?? '',
			parent,
			trackKind:
				TRACK_KINDS.find(
					/** First free kind. */ (k) => !version.tracks.some(/** Taken. */ (t) => t.kind === k),
				) ?? 'IndividualContributor',
			reason: '',
		})
		this.order.set(element?.order ?? this.nextOrder(kind, parent, version, roots))
		this.active.set(element?.active ?? true)
		this.draft.markClean()
	}

	/** The next sequence or order after the existing siblings. */
	private nextOrder(
		kind: CatalogueElementKind,
		parent: string,
		version: CatalogueVersionDto,
		roots: JobFamilyNodeDto[],
	): number {
		/** One more than the highest value. */
		const after = (values: number[]) => (values.length ? Math.max(...values) + 1 : 1)
		switch (kind) {
			case 'families':
				return parent === 'none' ? after(roots.map(/** Order. */ (f) => f.sortOrder)) : 10
			case 'tracks':
				return after(version.tracks.map(/** Order. */ (t) => t.sortOrder))
			case 'levels':
				return after(
					(version.tracks.find(/** Track. */ (t) => t.id === parent)?.levels ?? []).map(
						/** Sequence. */ (l) => l.sequence,
					),
				)
			case 'bands':
				return after(version.bands.map(/** Sequence. */ (b) => b.sequence))
			default:
				return after(
					(version.bands.find(/** Band. */ (b) => b.id === parent)?.grades ?? []).map(
						/** Sequence. */ (g) => g.sequence,
					),
				)
		}
	}

	/** Read the StepInput as a bounded integer. */
	setOrder(target: EventTarget | null): void {
		const max = this.ordered() ? 9999 : 99
		const min = this.ordered() ? 0 : 1
		const raw = Math.trunc(Number((target as HTMLInputElement | null)?.value) || min)
		this.order.set(Math.min(max, Math.max(min, raw)))
	}

	/** Toggle the active flag. */
	setActive(target: EventTarget | null): void {
		this.active.set((target as HTMLInputElement | null)?.checked === true)
	}

	/** Validate and submit one element command at the version revision. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [this.fields.code, this.fields.name, this.fields.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const { version, kind, element } = this.request()
		const v = this.model()
		const common = {
			name: v.name.trim(),
			description: v.description.trim(),
			expectedRevision: version.revision,
			reason: v.reason.trim(),
			...(kind === 'levels' ? { scopeSummary: v.scopeSummary.trim() } : {}),
		}
		const order = this.ordered() ? { sortOrder: this.order() } : { sequence: this.order() }
		if (element) {
			const body = { ...common, ...order, active: this.active() }
			this.submit(
				this.api.updateElement(
					version.id,
					kind,
					element.id,
					body,
					this.draft.key({ element: element.id, body }),
				),
			)
			return
		}
		const parents: Partial<Record<CatalogueElementKind, Record<string, unknown>>> = {
			families: { parentId: v.parent === 'none' ? null : v.parent },
			tracks: { kind: v.trackKind },
			levels: { trackId: v.parent },
			grades: { bandId: v.parent },
		}
		const body = { ...common, ...order, code: v.code, ...(parents[kind] ?? {}) }
		this.submit(this.api.addElement(version.id, kind, body, this.draft.key({ kind, body })))
	}
}
