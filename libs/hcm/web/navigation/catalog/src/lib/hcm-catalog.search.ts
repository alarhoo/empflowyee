import { HCM_FEATURES, HCM_SPACES } from './hcm-catalog.fixture'
import type { HcmFeatureDefinition, VisibleHcmSpace } from './hcm-catalog.models'

/** Search the visible catalogue across titles, codes, domains and canonical placement labels, once per app. */
export function searchHcmApplications(
	query: string,
	spaces: readonly VisibleHcmSpace[],
): readonly HcmFeatureDefinition[] {
	const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
	const visible = new Set<string>()
	for (const space of spaces)
		for (const page of space.pages)
			for (const group of page.groups) for (const app of group.features) visible.add(app.id)
	return HCM_FEATURES.filter(
		/** Match each search term against metadata without exposing hidden apps. */ (app) => {
			if (!visible.has(app.id)) return false
			const labels = [app.title, app.id, app.domain]
			for (const space of HCM_SPACES)
				for (const page of space.pages)
					for (const group of page.groups)
						if (group.featureIds.includes(app.id)) labels.push(space.title, page.title, group.title)
			const text = labels.join(' ').toLocaleLowerCase()
			return terms.every(
				/** Require all typed terms in the app's searchable metadata. */ (term) =>
					text.includes(term),
			)
		},
	)
}
