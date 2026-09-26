import { forkJoin, map, of, switchMap, type Observable } from 'rxjs'
import type { JobCatalogueApi } from '@empflowyee/hcm-web-job-architecture-data-access'
import type { JobFamilyNodeDto } from '@empflowyee/hcm-job-architecture-contract'

export interface FamilyTree {
	roots: JobFamilyNodeDto[]
	children: Record<string, JobFamilyNodeDto[]>
}

/** Load a version's families: roots and, since families are two levels deep, their children. */
export function familyTree(api: JobCatalogueApi, versionId: string): Observable<FamilyTree> {
	return api.families(versionId, null).pipe(
		switchMap(
			/** Load every root's children. */ (roots) => {
				if (!roots.items.length) return of({ roots: [], children: {} })
				const pages = roots.items.map(
					/** Children of one root. */ (root) => api.families(versionId, root.id),
				)
				return forkJoin(pages).pipe(
					map(
						/** Index children by root. */ (results) => ({
							roots: roots.items,
							children: Object.fromEntries(
								roots.items.map(
									/** One root's children. */ (root, index) => [
										root.id,
										results[index]?.items ?? [],
									],
								),
							),
						}),
					),
				)
			},
		),
	)
}

/** Roots each followed by their children, for flat pickers. */
export function flatFamilies(tree: FamilyTree): JobFamilyNodeDto[] {
	return tree.roots.flatMap(
		/** Root then children. */ (root) => [root, ...(tree.children[root.id] ?? [])],
	)
}
