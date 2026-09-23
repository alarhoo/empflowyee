import { Injectable, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import type { HcmFeatureDefinition } from '@empflowyee/hcm-web-navigation-catalog'
import { HcmRuntimeStore } from './hcm-runtime.store'

/** Global application navigation intents shared by shell chrome and lazy screens. */
@Injectable({ providedIn: 'root' })
export class HcmApplicationNavigation {
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly router = inject(Router)
	readonly query = signal('')
	readonly inspectAll = signal(false)
	readonly unavailable = signal<HcmFeatureDefinition | null>(null)
	readonly inspecting = computed(
		/** Honour only inspection capabilities advertised by the server session. */ () =>
			this.inspectAll() && this.runtime.context()?.development?.catalogueInspection === true,
	)
	/** Route global search to its catalogue-owned result screen. */
	async search(value: string): Promise<void> {
		this.query.set(value)
		await this.router.navigateByUrl('/')
	}
	/** Apply normal catalogue route policy without granting rights through inspection. */
	async open(app: HcmFeatureDefinition): Promise<void> {
		const { canAccessHcmFeature } = await import('@empflowyee/hcm-web-navigation-catalog')
		const context = this.runtime.context()
		if (context && canAccessHcmFeature(app, context.access))
			await this.router.navigateByUrl(app.route)
		else {
			this.unavailable.set(app)
			await this.router.navigateByUrl('/')
		}
	}
	/** Clear presentation intents before replacing the authoritative session. */
	async selectPersona(id: string): Promise<void> {
		this.inspectAll.set(false)
		this.query.set('')
		this.unavailable.set(null)
		await this.router.navigateByUrl('/')
		await this.runtime.selectDevelopmentPersona(id)
	}
}
