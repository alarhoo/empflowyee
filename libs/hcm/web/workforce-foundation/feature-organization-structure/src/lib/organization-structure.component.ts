import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	signal,
	viewChild,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { toSignal } from '@angular/core/rxjs-interop'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { ListItemStandard } from '@fundamental-ngx/ui5-webcomponents/list-item-standard'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import type { StructureDetail } from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { OrganisationProfileView } from '@empflowyee/hcm-workforce-foundation-contract'
import { StructureAreaComponent } from './structure-area.component'
import { StructureDetailComponent } from './structure-detail.component'
import { OrganisationProfileComponent } from './organisation-profile.component'
import { StructureItemDialog, type ItemDialogRequest } from './item-dialog.component'
import { StructureStatusDialog, type StatusDialogRequest } from './status-dialog.component'
import { OrganisationProfileDialog } from './profile-dialog.component'
import {
	MANAGE_PERMISSION,
	STRUCTURE_SECTIONS,
	sectionInfo,
	type StructureAreaInfo,
} from './structure-areas'

/** Organization Structure: native three-column FCL of areas, area items and item detail. */
@Component({
	selector: 'ef-hcm-organization-structure',
	imports: [
		FlexibleColumnLayout,
		List,
		ListItemStandard,
		MessageStrip,
		HcmDynamicPage,
		StructureAreaComponent,
		StructureDetailComponent,
		OrganisationProfileComponent,
		StructureItemDialog,
		StructureStatusDialog,
		OrganisationProfileDialog,
	],
	templateUrl: './organization-structure.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationStructureComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	readonly sections = STRUCTURE_SECTIONS
	readonly query = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	})
	readonly area = computed(
		/** Keep the chosen area deep-linkable and browser-history owned. */ () =>
			sectionInfo(this.query().get('area')),
	)
	readonly itemId = computed(
		/** Organisation has no item column. */ () =>
			this.area() && this.area()?.id !== 'organisation' ? this.query().get('item') : null,
	)
	readonly asOf = computed(
		/** Accept only a calendar date; the server defaults to today in the organisation time zone. */ () => {
			const value = this.query().get('asOf') ?? ''
			return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
		},
	)
	readonly layout = computed(
		/** Show only the columns the current selection needs. */ () => {
			if (!this.area()) return 'OneColumn'
			return this.itemId() ? 'ThreeColumnsEndExpanded' : 'TwoColumnsMidExpanded'
		},
	)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly refresh = signal(0)
	readonly notice = signal('')
	readonly itemDialog = signal<ItemDialogRequest | null>(null)
	readonly statusDialog = signal<StatusDialogRequest | null>(null)
	readonly profileDialog = signal<OrganisationProfileView | null>(null)
	private readonly itemEditor = viewChild(StructureItemDialog)
	private readonly statusEditor = viewChild(StructureStatusDialog)
	private readonly profileEditor = viewChild(OrganisationProfileDialog)

	/** Navigate within the feature while preserving the as-of date. */
	private select(params: { area?: string | null; item?: string | null }): void {
		const area = params.area === undefined ? (this.area()?.id ?? null) : params.area
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: {
				area,
				item: params.item ?? null,
				asOf: area === 'units' && this.asOf() ? this.asOf() : null,
			},
		})
	}

	/** Open an area from the begin column. */
	chooseArea(item: HTMLElement | null): void {
		const id = item?.dataset['area']
		if (id) this.select({ area: id, item: null })
	}

	/** Open an item in the end column. */
	openItem(id: string): void {
		this.select({ item: id })
	}

	/** Close the end column. */
	closeItem(): void {
		this.select({ item: null })
	}

	/** Close the mid column on narrow screens. */
	closeArea(): void {
		this.select({ area: null, item: null })
	}

	/** Change the unit as-of date. */
	changeAsOf(value: string): void {
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { asOf: value || null },
			queryParamsHandling: 'merge',
		})
	}

	/** Start creation: many-field areas use a dedicated route, the others a Dialog. */
	create(area: StructureAreaInfo): void {
		if (!this.canManage()) return
		this.notice.set('')
		if (area.routed) void this.router.navigate([area.id, 'new'], { relativeTo: this.route })
		else this.itemDialog.set({ area, item: null })
	}

	/** Start editing, or adding a unit version, on the approved surface. */
	edit(area: StructureAreaInfo, item: StructureDetail): void {
		if (!this.canManage()) return
		this.notice.set('')
		if (area.routed)
			void this.router.navigate([area.id, item.id, 'edit'], { relativeTo: this.route })
		else this.itemDialog.set({ area, item })
	}

	/** Open the retire, disable or reactivate Dialog. */
	changeStatus(area: StructureAreaInfo, item: StructureDetail): void {
		if (!this.canManage()) return
		this.notice.set('')
		this.statusDialog.set({ area, item })
	}

	/** Refresh both columns after a confirmed command and select the saved item. */
	saved(detail: StructureDetail): void {
		this.itemDialog.set(null)
		this.statusDialog.set(null)
		this.notice.set(`${detail.name} saved.`)
		this.refresh.update(/** Invalidate loaded columns. */ (value) => value + 1)
		this.select({ item: detail.id })
	}

	/** Refresh the organisation profile after a confirmed save. */
	profileSaved(): void {
		this.profileDialog.set(null)
		this.notice.set('Organisation defaults saved.')
		this.refresh.update(/** Invalidate the profile. */ (value) => value + 1)
	}

	/** Consult any open draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		const editor = this.itemEditor() ?? this.statusEditor() ?? this.profileEditor()
		return editor?.canLeave() ?? Promise.resolve(true)
	}
}
