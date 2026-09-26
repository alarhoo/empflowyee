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
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import {
	HcmDynamicPage,
	type HcmPageAction,
	type HcmPageState,
} from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	OrganisationStructureApi,
	structureDenied,
	structureErrorMessage,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { OrganisationProfileView } from '@empflowyee/hcm-workforce-foundation-contract'
import { MONTHS, languageOptions } from './structure-areas'

/** Mid column for organisation HR defaults; the display name stays Account-owned. */
@Component({
	selector: 'ef-hcm-organisation-profile',
	imports: [Form, FormItem, Label, Text, MessageStrip, HcmDynamicPage],
	template: `<ef-hcm-dynamic-page
		title="Organisation"
		summary="HR defaults used across the organisation"
		[state]="state()"
		[readOnly]="!canManage()"
		[actions]="actions()"
		[errorMessage]="message()"
		(action)="action($event)"
		(retry)="load()"
	>
		@if (view(); as current) {
			@if (!current.profile) {
				<ui5-message-strip [hideCloseButton]="true">
					HR defaults have not been configured for this organisation yet.
				</ui5-message-strip>
			}
			<ui5-form
				accessibleName="Organisation HR defaults"
				accessibleMode="Display"
				layout="S1 M1 L2 XL2"
			>
				<ui5-form-item>
					<ui5-label slot="labelContent">Organisation name</ui5-label>
					<ui5-text>{{ current.organisationName }}</ui5-text>
				</ui5-form-item>
				@if (current.profile; as profile) {
					<ui5-form-item>
						<ui5-label slot="labelContent">Default time zone</ui5-label>
						<ui5-text>{{ profile.defaultTimeZone }}</ui5-text>
					</ui5-form-item>
					<ui5-form-item>
						<ui5-label slot="labelContent">Default language</ui5-label>
						<ui5-text>{{ language(profile.defaultLanguage) }}</ui5-text>
					</ui5-form-item>
					<ui5-form-item>
						<ui5-label slot="labelContent">Default currency</ui5-label>
						<ui5-text
							>{{ profile.defaultCurrency.name }} ({{ profile.defaultCurrency.code }})</ui5-text
						>
					</ui5-form-item>
					<ui5-form-item>
						<ui5-label slot="labelContent">Financial year starts</ui5-label>
						<ui5-text>
							{{ months[profile.financialYearStartMonth - 1] }} {{ profile.financialYearStartDay }}
						</ui5-text>
					</ui5-form-item>
					<ui5-form-item>
						<ui5-label slot="labelContent">Headquarters</ui5-label>
						<ui5-text>{{ profile.headquartersLocation?.name ?? '—' }}</ui5-text>
					</ui5-form-item>
				}
			</ui5-form>
			<ui5-text>The organisation name is managed in the Account portal.</ui5-text>
		}
	</ef-hcm-dynamic-page>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganisationProfileComponent {
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly edit = output<OrganisationProfileView>()
	readonly closed = output<void>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	readonly months = MONTHS
	readonly view = signal<OrganisationProfileView | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly actions = computed(
		/** Configure or edit defaults, plus a return path for narrow screens. */ () => {
			const actions: HcmPageAction[] = [{ id: 'close', label: 'Back to areas' }]
			const view = this.view()
			if (view)
				actions.push({
					id: 'edit',
					label: view.profile ? 'Edit defaults' : 'Configure defaults',
					mutates: true,
					emphasized: true,
				})
			return actions
		},
	)

	/** Reload after context replacement or a committed change. */
	constructor() {
		effect(
			/** Track context and committed revisions. */ () => {
				this.refresh()
				const context = this.runtime.context()
				untracked(
					/** Clear then load. */ () => {
						this.view.set(null)
						if (context) this.load()
					},
				)
			},
		)
	}

	/** Read the current profile. */
	load(): void {
		this.state.set('loading')
		this.message.set('')
		this.api
			.profile()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the server projection. */ (view) => {
					this.view.set(view)
					this.state.set('content')
				},
				error: /** Map failure to truthful state. */ (error) => {
					this.message.set(structureErrorMessage(error))
					this.state.set(structureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Label a BCP 47 language tag. */
	language(tag: string): string {
		return (
			languageOptions(tag).find(/** Match the tag. */ (item) => item.value === tag)?.label ?? tag
		)
	}

	/** Route floorplan actions to the shell. */
	action(id: string): void {
		const view = this.view()
		if (id === 'edit' && view) this.edit.emit(view)
		else if (id === 'close') this.closed.emit()
	}
}
