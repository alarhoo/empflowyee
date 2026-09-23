import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Injectable, computed, inject, signal } from '@angular/core'
import { firstValueFrom, timeout } from 'rxjs'
import {
	isTenantAccessible,
	resolveHcmPreferences,
	parseHcmTenantDiscovery,
	parseHcmRuntimeContext,
	type HcmRuntimeContext,
	type TenantDiscoveryResponse,
	type RuntimeFailureCode,
} from '@empflowyee/hcm-runtime-contract'
import { HcmRuntimeState } from './hcm-runtime.models'

@Injectable({ providedIn: 'root' })
export class HcmRuntimeStore {
	private readonly http = inject(HttpClient)
	private readonly current = signal<HcmRuntimeState>({ kind: 'tenant-loading' })
	private pending?: Promise<void>
	private developmentPersona?: string
	readonly state = this.current.asReadonly()
	readonly context = computed(
		/** Expose authenticated context only while the state is ready. */ () => {
			const state = this.state()
			return state.kind === 'ready' ? state.context : null
		},
	)
	readonly tenant = computed(
		/** Select safe tenant presentation during both bootstrap stages. */ () => {
			const state = this.state()
			if (state.kind === 'ready') return state.context.tenant
			return 'discovery' in state ? state.discovery.tenant : undefined
		},
	)
	readonly preferences = computed(
		/** Resolve user overrides independently of tenant branding. */ () =>
			resolveHcmPreferences(this.tenant(), this.context()?.preferences),
	)

	/** Share one bootstrap between the shell and route guards; retries explicitly request a refresh. */
	ensureLoaded(): Promise<void> {
		this.pending ??= this.load()
		return this.pending
	}

	/** Clear authenticated context and repeat tenant discovery before session loading. */
	async refresh(): Promise<void> {
		if (this.state().kind === 'tenant-loading' || this.state().kind === 'session-loading') {
			await this.ensureLoaded()
			return
		}
		this.pending = this.load()
		await this.pending
	}

	/** Select a server-advertised local persona through the normal runtime API, never by editing access state. */
	async selectDevelopmentPersona(id: string): Promise<void> {
		if (
			!this.context()?.development?.personas.some(
				/** Restrict selection to choices returned by the server. */ (persona) => persona.id === id,
			)
		)
			return
		this.developmentPersona = id
		await this.refresh()
	}

	/** Fetch tenant and session after Angular startup, preserving distinct failure states. */
	private async load(): Promise<void> {
		this.current.set({ kind: 'tenant-loading' })
		let discovery: TenantDiscoveryResponse | undefined
		let requestId = crypto.randomUUID()
		try {
			discovery = parseHcmTenantDiscovery(
				await firstValueFrom(
					this.http
						.get<TenantDiscoveryResponse>('/api/v1/runtime/tenant', {
							headers: { 'X-Request-ID': requestId },
						})
						.pipe(timeout(15000)),
				),
			)
			if (!isTenantAccessible(discovery.tenant)) {
				this.current.set({ kind: 'tenant-suspended', discovery })
				return
			}
			this.current.set({ kind: 'session-loading', discovery })
			requestId = crypto.randomUUID()
			const context = parseHcmRuntimeContext(
				await firstValueFrom(
					this.http
						.get<HcmRuntimeContext>('/api/v1/runtime/session', {
							headers: {
								'X-Request-ID': requestId,
								...(this.developmentPersona
									? { 'X-HCM-Development-Persona': this.developmentPersona }
									: {}),
							},
						})
						.pipe(timeout(15000)),
				),
			)
			if (context.tenant.slug !== discovery.tenant.slug) throw new Error('Runtime tenant mismatch')
			if (!isTenantAccessible(context.tenant)) {
				this.current.set({
					kind: 'tenant-suspended',
					discovery: { ...discovery, tenant: context.tenant },
				})
				return
			}
			this.current.set({ kind: 'ready', context })
		} catch (error) {
			if (error instanceof HttpErrorResponse) {
				if (error.status === 404) {
					this.current.set({ kind: 'tenant-not-found' })
					return
				}
				if (error.status === 401 && discovery) {
					this.current.set({ kind: 'auth-required', discovery })
					return
				}
				if (error.status === 423 && discovery) {
					this.current.set({ kind: 'tenant-suspended', discovery })
					return
				}
			}
			const code: RuntimeFailureCode =
				error instanceof HttpErrorResponse && error.status === 403
					? 'forbidden'
					: 'runtime-unavailable'
			console.warn('HCM runtime bootstrap failed', { code, requestId })
			this.current.set({ kind: 'error', failure: { code, requestId } })
		}
	}
}
