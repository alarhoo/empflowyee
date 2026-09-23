import { inject } from '@angular/core'
import { Router, type CanMatchFn } from '@angular/router'
import { HcmRuntimeStore } from './hcm-runtime.store'

/** Wait for runtime authority before matching a lazy feature and deny unknown catalog IDs. */
export const hcmRouteAccess: CanMatchFn = async (route, segments) => {
	const runtime = inject(HcmRuntimeStore)
	const router = inject(Router)
	await runtime.ensureLoaded()
	const context = runtime.context()
	if (!context)
		return router.createUrlTree(['/'], {
			queryParams: {
				returnTo:
					'/' +
					segments
						.map(/** Preserve only router-parsed local path segments. */ (segment) => segment.path)
						.join('/'),
			},
		})
	const { canAccessHcmFeature, findHcmFeature } =
		await import('@empflowyee/hcm-web-navigation-catalog')
	return (
		canAccessHcmFeature(findHcmFeature(route.data?.['catalogId']), context.access) ||
		router.createUrlTree(['/access-denied'])
	)
}
