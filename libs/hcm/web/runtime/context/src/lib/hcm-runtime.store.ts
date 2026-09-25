import { DOCUMENT } from '@angular/common'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Injectable, computed, inject, signal } from '@angular/core'
import { firstValueFrom, timeout } from 'rxjs'
import {
	isTenantAccessible,
	resolveHcmPreferences,
	parseHcmTenantDiscovery,
	parseHcmRuntimeContext,
	type HcmRuntimeContext,
	type HcmPreferences,
	type TenantDiscoveryResponse,
	type RuntimeFailureCode,
} from '@empflowyee/hcm-runtime-contract'
import { HcmRuntimeState } from './hcm-runtime.models'

@Injectable({ providedIn: 'root' })
export class HcmRuntimeStore {
	private readonly http = inject(HttpClient)
	private readonly window = inject(DOCUMENT).defaultView
	private readonly localPreferences = signal<HcmPreferences>({})
	readonly preferenceSaveState = signal<'idle' | 'saved' | 'failed'>('idle')
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
			resolveHcmPreferences(this.tenant(), {
				...this.context()?.preferences,
				...this.localPreferences(),
			}),
	)

	/** Format a runtime timestamp with the current account's display preferences. */
	formatTimestamp(value: string | Date, dateOnly = false): string {
		const preferences = this.preferences(),
			date = new Date(value)
		if (!Number.isFinite(date.getTime())) return '—'
		const dateStyle = ['short', 'medium', 'long', 'full'].includes(preferences.dateFormat)
			? (preferences.dateFormat as 'short' | 'medium' | 'long' | 'full')
			: 'medium'
		return new Intl.DateTimeFormat(preferences.language, {
			dateStyle,
			...(dateOnly ? {} : { timeStyle: 'short' as const }),
			timeZone: dateOnly ? 'UTC' : preferences.timezone,
			hour12: preferences.timeFormat === '12h',
		}).format(date)
	}
	/** Save non-sensitive presentation choices per tenant/account in this browser only. */
	setPresentationPreference(key: 'language' | 'dateFormat' | 'timeFormat', value: string): void {
		const allowed = {
			language: ['en', 'de', 'fr', 'es'],
			dateFormat: ['short', 'medium', 'long'],
			timeFormat: ['12h', '24h'],
		}
		const context = this.context()
		if (!context || !allowed[key].includes(value)) return
		this.localPreferences.update(
			/** Preserve other local presentation choices. */ (current) => ({ ...current, [key]: value }),
		)
		try {
			if (!this.window) throw new Error('Browser storage unavailable')
			this.window?.localStorage.setItem(
				`hcm.preferences.${context.tenant.slug}.${context.user.id}`,
				JSON.stringify(this.localPreferences()),
			)
			this.preferenceSaveState.set('saved')
		} catch {
			this.preferenceSaveState.set('failed')
			/* In-memory preferences remain usable when storage is blocked. */
		}
	}
	/** Clear the local development workspace; this is not production session revocation. */
	signOutDevelopment(): void {
		if (!this.context()?.development) return
		this.current.set({ kind: 'signed-out' })
		try {
			this.window?.sessionStorage.setItem('hcm.development.signed-out', 'true')
		} catch {
			/* Retain the signed-out state in memory. */
		}
	}
	/** Re-enter the explicitly signed-out local workspace through tenant/session discovery. */
	async resumeDevelopment(): Promise<void> {
		try {
			this.window?.sessionStorage.removeItem('hcm.development.signed-out')
		} catch {
			/* Explicit re-entry still works without storage. */
		}
		this.pending = this.load()
		await this.pending
	}
	/** Restore only supported presentation values; never restore identity or access from storage. */
	private restorePreferences(context: HcmRuntimeContext): void {
		this.localPreferences.set({})
		try {
			const raw: unknown = JSON.parse(
				this.window?.localStorage.getItem(
					`hcm.preferences.${context.tenant.slug}.${context.user.id}`,
				) ?? '{}',
			)
			if (!raw || typeof raw !== 'object') return
			const choices = raw as Record<string, unknown>
			for (const key of ['language', 'dateFormat', 'timeFormat'] as const) {
				if (typeof choices[key] === 'string') this.setPresentationPreference(key, choices[key])
			}
		} catch {
			/* Ignore malformed browser preferences and retain server defaults. */
		}
		this.preferenceSaveState.set('idle')
	}
	/** Share one bootstrap between the shell and route guards; retries explicitly request a refresh. */
	ensureLoaded(): Promise<void> {
		if (!this.pending) {
			try {
				if (this.window?.sessionStorage.getItem('hcm.development.signed-out') === 'true') {
					this.current.set({ kind: 'signed-out' })
					this.pending = Promise.resolve()
				}
			} catch {
				/* Continue normal discovery without browser storage. */
			}
		}
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
			this.restorePreferences(context)
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
