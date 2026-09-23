import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { HcmRuntimeStore } from './hcm-runtime.store'
import { hcmRouteAccess } from './hcm-route-access'

@Component({ selector: 'ef-hcm-test-allowed', template: 'Allowed placeholder' })
class AllowedFeature {}
@Component({ selector: 'ef-hcm-test-denied', template: 'Access denied' })
class DeniedFeature {}

it('does not invoke the lazy loader on direct unauthorized navigation, then permits the same route with capabilities', /** Exercise Angular canMatch before feature loading using the canonical stable catalog ID. */ async () => {
	const context = {
		access: {
			roles: ['tenant-super-admin'],
			permissions: [] as string[],
			entitlements: ['employee-core'],
			featureFlags: ['shell-preview'],
		},
	}
	const loader = vi.fn(
		/** Model the app composition root's lazy feature import. */ async () => AllowedFeature,
	)
	TestBed.configureTestingModule({
		providers: [
			{
				provide: HcmRuntimeStore,
				useValue: {
					ensureLoaded: /** Model completed remote bootstrap. */ async () => undefined,
					context: /** Read the current authenticated capabilities. */ () => context,
				},
			},
			provideRouter([
				{
					path: 'workspace',
					data: { catalogId: 'runtime-workspace' },
					canMatch: [hcmRouteAccess],
					loadComponent: loader,
				},
				{ path: 'access-denied', component: DeniedFeature },
			]),
		],
	})
	const harness = await RouterTestingHarness.create()
	await harness.navigateByUrl('/workspace', DeniedFeature)
	expect(TestBed.inject(Router).url).toBe('/access-denied')
	expect(loader).not.toHaveBeenCalled()
	context.access.permissions.push('employee.directory.read')
	await harness.navigateByUrl('/workspace', AllowedFeature)
	expect(loader).toHaveBeenCalledOnce()
})
