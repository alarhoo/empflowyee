import { DOCUMENT } from '@angular/common'
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { HcmRuntimeStore } from './hcm-runtime.store'
import { hcmApiInterceptor } from './hcm-api-interceptor'

const context = signal<{ development: { personaId: string } } | null>(null)
let client: HttpClient
let http: HttpTestingController

beforeEach(
	/** Isolate transport policy with a test-only runtime signal and no business fixtures. */ () => {
		context.set({ development: { personaId: 'david' } })
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withInterceptors([hcmApiInterceptor])),
				provideHttpClientTesting(),
				{
					provide: DOCUMENT,
					useValue: {
						baseURI: 'http://acme.localhost:4302/',
						location: { origin: 'http://acme.localhost:4302' },
					},
				},
				{ provide: HcmRuntimeStore, useValue: { context } },
			],
		})
		client = TestBed.inject(HttpClient)
		http = TestBed.inject(HttpTestingController)
	},
)
afterEach(
	/** Assert every request was consumed or cancelled and destroy its context watchers. */ () => {
		http.verify({ ignoreCancelled: true })
		TestBed.resetTestingModule()
	},
)

it('scopes persona propagation to same-origin HCM requests and forbids redirects', /** Inspect the actual intercepted request, not a helper approximation. */ () => {
	client.get('/api/v1/access-control/roles').subscribe()
	const call = http.expectOne('/api/v1/access-control/roles')
	expect(call.request.headers.get('X-HCM-Development-Persona')).toBe('david')
	expect(call.request.redirect).toBe('error')
	call.flush({})
	for (const url of [
		'https://foreign.example/api/v1/access-control/roles',
		'/assets/config.json',
		'/api/v10/other',
	]) {
		client.get(url, { headers: { 'X-HCM-Development-Persona': 'david' } }).subscribe()
		const foreign = http.expectOne(url)
		expect(foreign.request.headers.has('X-HCM-Development-Persona')).toBe(false)
		foreign.flush({})
	}
})

it('cancels requests and suppresses obsolete results when runtime context changes', /** A persona change invalidates a pending subscription before another account receives its result. */ () => {
	const next = vi.fn(),
		complete = vi.fn()
	client.get('/api/v1/access-control/roles').subscribe({ next, complete })
	const call = http.expectOne('/api/v1/access-control/roles')
	TestBed.tick()
	context.set({ development: { personaId: 'jim' } })
	TestBed.tick()
	expect(call.cancelled).toBe(true)
	expect(next).not.toHaveBeenCalled()
	expect(complete).toHaveBeenCalledOnce()
})

it('fails business calls closed during bootstrap while preserving explicit session selection', /** Bootstrap selection remains runtime-owned and does not require a ready business context. */ () => {
	context.set(null)
	const error = vi.fn()
	client.get('/api/v1/access-control/roles').subscribe({ error })
	http.expectNone('/api/v1/access-control/roles')
	expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }))
	client
		.get('/api/v1/runtime/session', { headers: { 'X-HCM-Development-Persona': 'toby' } })
		.subscribe()
	const session = http.expectOne('/api/v1/runtime/session')
	expect(session.request.headers.get('X-HCM-Development-Persona')).toBe('toby')
	expect(session.request.redirect).toBe('error')
	session.flush({})
})
