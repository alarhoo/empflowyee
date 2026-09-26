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
import type { Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	JobCatalogueApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
	jobArchitectureMissing,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type {
	JobProfileVersionDto,
	ProfileVersionSummaryDto,
} from '@empflowyee/hcm-job-architecture-contract'
import type { LifecycleRequest } from './lifecycle-dialog.component'
import { TRACK_KIND_LABELS, versionStatus } from './labels'

/** Mid column: one job profile version with its content and version history. */
@Component({
	selector: 'ef-hcm-job-profile-version',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Timeline,
		TimelineItem,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './profile-version.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileVersionComponent {
	readonly versionId = input.required<string>()
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly canPublish = input(false)
	readonly commanded = output<LifecycleRequest>()
	readonly edited = output<string>()
	readonly opened = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(JobCatalogueApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly status = versionStatus
	readonly trackKinds = TRACK_KIND_LABELS
	readonly version = signal<JobProfileVersionDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly actions = computed(
		/** Lifecycle actions allowed for the viewer and the version status. */ () => {
			const version = this.version()
			const open = version?.versions.some(
				/** An open draft or review. */ (v) => v.status === 'Draft' || v.status === 'InReview',
			)
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (version?.status === 'Draft' && this.canManage()) {
				actions.push({ id: 'edit', label: 'Edit draft', mutates: true, emphasized: true })
				actions.push({ id: 'submit', label: 'Submit for review', mutates: true })
			}
			if (version?.status === 'InReview' && this.canPublish())
				actions.push({ id: 'publish', label: 'Publish', mutates: true, emphasized: true })
			if (version?.status === 'Published' && version.current && this.canManage() && !open)
				actions.push({ id: 'new-draft', label: 'Create draft', mutates: true, emphasized: true })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the version or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.versionId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the profile version. */
	load(): void {
		this.request?.unsubscribe()
		if (!this.version() || this.version()?.id !== this.versionId()) this.state.set('loading')
		this.message.set('')
		this.request = this.api
			.readProfileVersion(this.versionId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the version. */ (version) => {
					this.version.set(version)
					this.state.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.version.set(null)
					this.message.set(
						jobArchitectureMissing(error)
							? 'This job profile version is no longer available.'
							: jobArchitectureErrorMessage(error),
					)
					this.state.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Timeline wording of one version. */
	subtitle(version: ProfileVersionSummaryDto): string {
		return this.status(version.status).label + (version.current ? ', current' : '')
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const version = this.version()
		if (id === 'close') this.closed.emit()
		else if (!version) return
		else if (id === 'edit') this.edited.emit(version.id)
		else if (id === 'new-draft' || id === 'submit' || id === 'publish')
			this.commanded.emit({ mode: id, target: { type: 'profile', version } })
	}

	/** Open another version from the timeline. */
	open(id: string): void {
		if (id !== this.versionId()) this.opened.emit(id)
	}
}
