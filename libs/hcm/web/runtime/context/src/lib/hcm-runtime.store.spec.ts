import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import type { HcmRuntimeContext, TenantDiscoveryResponse } from '@empflowyee/hcm-runtime-contract'
import { HcmRuntimeStore } from './hcm-runtime.store'
import { HcmAccessService } from './hcm-access.service'

const discovery: TenantDiscoveryResponse = {
	tenant: {
		slug: 'acme',
		displayName: 'Acme',
		status: 'active',
		allowUserTheme: true,
		defaults: { theme: 'her-light', locale: 'en-IN' },
	},
	authentication: { strategies: [] },
}
const context: HcmRuntimeContext = {
	tenant: discovery.tenant,
	user: { id: 'test', displayName: 'Test user' },
	access: {
		roles: ['tenant-super-admin'],
		permissions: ['employee.directory.read'],
		entitlements: ['employee-core'],
		featureFlags: ['shell-preview'],
	},
	preferences: { theme: 'horizon-dark' },
	session: { version: 'test' },
}

describe('HCM remote bootstrap', /** Exercise real HTTP sequencing and state transitions without production fixtures. */ () => {
	let http: HttpTestingController
	let runtime: HcmRuntimeStore
	beforeEach(
		/** Configure isolated browser HTTP and runtime state. */ () => {
			TestBed.configureTestingModule({
				providers: [provideHttpClient(), provideHttpClientTesting()],
			})
			http = TestBed.inject(HttpTestingController)
			runtime = TestBed.inject(HcmRuntimeStore)
		},
	)
	afterEach(/** Reject any unexpected or unconsumed API request. */ () => http.verify())

	it('does not call remote APIs at service construction and shares a concurrent bootstrap', /** Assert local startup stays independent of remote tenant/session requests. */ async () => {
		http.expectNone('/api/v1/runtime/tenant')
		const pending = runtime.ensureLoaded()
		expect(runtime.ensureLoaded()).toBe(pending)
		const tenantRequest = http.expectOne('/api/v1/runtime/tenant')
		expect(tenantRequest.request.headers.get('X-Request-ID')).toBeTruthy()
		expect(tenantRequest.request.params.keys()).toEqual([])
		tenantRequest.flush(discovery)
		await Promise.resolve()
		expect(runtime.state().kind).toBe('session-loading')
		expect(runtime.preferences().theme).toBe('her-light')
		http.expectOne('/api/v1/runtime/session').flush(context)
		await pending
		expect(runtime.state().kind).toBe('ready')
		expect(runtime.preferences()).toMatchObject({
			theme: 'horizon-dark',
			locale: 'en-IN',
			timezone: 'UTC',
		})
		const access = TestBed.inject(HcmAccessService)
		expect(access.hasPermission('employee.directory.read')).toBe(true)
		expect(access.hasAnyPermission(['other', 'employee.directory.read'])).toBe(true)
		expect(access.hasAllPermissions(['employee.directory.read', 'other'])).toBe(false)
		expect(access.hasEntitlement('leave')).toBe(false)
	})

	it.each(['suspended', 'deactivated'] as const)(
		'blocks %s before requesting a session',
		/** Ensure lifecycle-disabled tenants never enter feature access. */ async (status) => {
			const pending = runtime.ensureLoaded()
			http
				.expectOne('/api/v1/runtime/tenant')
				.flush({ ...discovery, tenant: { ...discovery.tenant, status } })
			await pending
			expect(runtime.state().kind).toBe('tenant-suspended')
			http.expectNone('/api/v1/runtime/session')
		},
	)

	it('maps unknown hosts separately from failures', /** Keep a missing tenant distinguishable from a server outage. */ async () => {
		const pending = runtime.ensureLoaded()
		http.expectOne('/api/v1/runtime/tenant').flush({}, { status: 404, statusText: 'Not Found' })
		await pending
		expect(runtime.state().kind).toBe('tenant-not-found')
		expect(TestBed.inject(HcmAccessService).hasAllPermissions([])).toBe(false)
	})

	it.each([401, 403, 423, 503])(
		'classifies session status %s',
		/** Preserve authentication, authorization, lifecycle and operational distinctions. */ async (
			status,
		) => {
			const pending = runtime.ensureLoaded()
			http.expectOne('/api/v1/runtime/tenant').flush(discovery)
			await Promise.resolve()
			http.expectOne('/api/v1/runtime/session').flush({}, { status, statusText: 'Test failure' })
			await pending
			const expected = { 401: 'auth-required', 403: 'error', 423: 'tenant-suspended', 503: 'error' }
			expect(runtime.state().kind).toBe(expected[status as keyof typeof expected])
			expect(runtime.context()).toBeNull()
		},
	)

	it('rejects a session returned for a different tenant', /** Fail closed on a mismatched authenticated response. */ async () => {
		const pending = runtime.ensureLoaded()
		http.expectOne('/api/v1/runtime/tenant').flush(discovery)
		await Promise.resolve()
		http
			.expectOne('/api/v1/runtime/session')
			.flush({ ...context, tenant: { ...context.tenant, slug: 'other' } })
		await pending
		expect(runtime.state().kind).toBe('error')
	})

	it('clears authenticated data synchronously and coalesces retries', /** Prevent stale feature access during a session refresh or duplicate retry requests. */ async () => {
		const initial = runtime.ensureLoaded()
		http.expectOne('/api/v1/runtime/tenant').flush(discovery)
		await Promise.resolve()
		http.expectOne('/api/v1/runtime/session').flush(context)
		await initial
		const retry = runtime.refresh()
		const duplicate = runtime.refresh()
		expect(runtime.context()).toBeNull()
		http.expectOne('/api/v1/runtime/tenant').flush(discovery)
		await Promise.resolve()
		http.expectOne('/api/v1/runtime/session').flush({}, { status: 401, statusText: 'Unauthorized' })
		await Promise.all([retry, duplicate])
		expect(runtime.state().kind).toBe('auth-required')
	})
	it('changes persona only through a server-advertised normal session request', /** Verify the header stays at the runtime boundary and refreshed capabilities replace prior context. */ async () => {
		const local = {
			...context,
			development: {
				personaId: 'jim',
				catalogueInspection: true,
				personas: [
					{ id: 'jim', displayName: 'Jim Halpert', roleLabel: 'Employee' },
					{ id: 'toby', displayName: 'Toby Flenderson', roleLabel: 'HR Operations' },
				],
			},
		}
		const initial = runtime.ensureLoaded()
		http.expectOne('/api/v1/runtime/tenant').flush(discovery)
		await Promise.resolve()
		const initialSession = http.expectOne('/api/v1/runtime/session')
		expect(initialSession.request.headers.has('X-HCM-Development-Persona')).toBe(false)
		initialSession.flush(local)
		await initial
		await runtime.selectDevelopmentPersona('unknown')
		http.expectNone('/api/v1/runtime/session')
		const switching = runtime.selectDevelopmentPersona('toby')
		expect(runtime.context()).toBeNull()
		const tenant = http.expectOne('/api/v1/runtime/tenant')
		expect(tenant.request.headers.has('X-HCM-Development-Persona')).toBe(false)
		tenant.flush(discovery)
		await Promise.resolve()
		const session = http.expectOne('/api/v1/runtime/session')
		expect(session.request.headers.get('X-HCM-Development-Persona')).toBe('toby')
		session.flush({
			...local,
			user: { id: 'toby', displayName: 'Toby Flenderson' },
			access: { roles: ['hr-specialist'], permissions: [], entitlements: [], featureFlags: [] },
		})
		await switching
		expect(runtime.context()?.user.displayName).toBe('Toby Flenderson')
		expect(runtime.context()?.access.permissions).toEqual([])
	})
})
