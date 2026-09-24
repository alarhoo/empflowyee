import { Injectable, computed, inject } from '@angular/core'
import { HcmRuntimeStore, HcmApplicationNavigation } from '@empflowyee/hcm-web-runtime-context'
import {
	getVisibleHcmSpaces,
	searchHcmApplications,
	type VisibleHcmSpace,
	type VisibleHcmPage,
} from '@empflowyee/hcm-web-navigation-catalog'

@Injectable()
export class HcmLaunchpadState {
	private readonly runtime = inject(HcmRuntimeStore)
	readonly navigation = inject(HcmApplicationNavigation)
	readonly query = this.navigation.query
	readonly selectedSpaceId = this.navigation.selectedSpaceId
	readonly selectedPageId = this.navigation.selectedPageId
	readonly unavailable = this.navigation.unavailable
	readonly inspecting = this.navigation.inspecting
	readonly spaces = computed(
		/** Project normal persona visibility or explicitly requested metadata inspection. */ () => {
			const context = this.runtime.context()
			return context
				? getVisibleHcmSpaces(context.access, undefined, undefined, this.inspecting())
				: []
		},
	)
	readonly activeSpace = computed<VisibleHcmSpace | undefined>(
		/** Recover a permitted Space after persona or entitlement changes. */ () =>
			this.spaces().find(
				/** Resolve the selected canonical Space. */ (space) => space.id === this.selectedSpaceId(),
			) ?? this.spaces()[0],
	)
	readonly activePage = computed<VisibleHcmPage | undefined>(
		/** Recover a valid Page when the current Space changes. */ () =>
			this.activeSpace()?.pages.find(
				/** Resolve the selected Page within this Space. */ (page) =>
					page.id === this.selectedPageId(),
			) ?? this.activeSpace()?.pages[0],
	)
	readonly results = computed(
		/** Search once per app across the currently discoverable catalogue. */ () =>
			searchHcmApplications(this.query(), this.spaces()),
	)
	readonly applicationCount = computed(
		/** Count unique apps even when they have multiple placements. */ () =>
			searchHcmApplications('', this.spaces()).length,
	)

	/** Change the selected Space without changing domain ownership or loading a feature. */
	selectSpace(id: string | null): void {
		if (id) this.selectedSpaceId.set(id)
		this.query.set('')
	}
	/** Change the selected canonical Page while preserving its native group ordering. */
	selectPage(id: string | null): void {
		if (id) this.selectedPageId.set(id)
	}
	/** Open the selected entry through the global application navigation policy. */
	open(app: Parameters<HcmApplicationNavigation['open']>[0]): Promise<void> {
		return this.navigation.open(app)
	}
}
