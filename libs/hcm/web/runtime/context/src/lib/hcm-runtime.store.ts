import { Injectable, computed, signal } from '@angular/core'
import { HcmRuntimeContext, HcmRole, HcmEntitlement } from './hcm-runtime.models'

const DEMO_CONTEXT: HcmRuntimeContext = {
	tenant: {
		tenantId: 'tenant-acme-demo',
		slug: 'acme',
		displayName: 'Acme Corporation',
		defaultTheme: 'horizon-light',
		defaultLocale: 'en-IN',
		defaultTimezone: 'Asia/Kolkata',
		defaultDateFormat: 'DD/MM/YYYY',
		defaultTimeFormat: '12h',
		defaultNumberFormat: '1,23,456.78',
	},
	principal: {
		userId: 'user-demo-001',
		employeeId: 'EMP-0001',
		displayName: 'Alex Morgan',
		email: 'alex@acme.example',
		roles: ['employee', 'manager', 'tenant-super-admin'],
		entitlements: [
			'employee-core',
			'organisation',
			'leave',
			'time',
			'expenses',
			'notifications',
			'analytics',
			'administration',
		],
	},
	preferences: {},
}

@Injectable({ providedIn: 'root' })
export class HcmRuntimeStore {
	private readonly _context = signal<HcmRuntimeContext>(DEMO_CONTEXT)

	readonly context = this._context.asReadonly()
	readonly tenant = computed(
		/** Expose tenant presentation defaults. */ () => this._context().tenant,
	)
	readonly principal = computed(
		/** Expose the fixture principal without performing authentication. */ () =>
			this._context().principal,
	)
	readonly preferences = computed(
		/** Expose optional user presentation overrides. */ () => this._context().preferences,
	)
	readonly roles = computed(
		/** Project effective roles into a catalog lookup set. */ () => new Set(this.principal().roles),
	)
	readonly entitlements = computed(
		/** Project licensed capabilities into a catalog lookup set. */ () =>
			new Set(this.principal().entitlements),
	)

	/** Fixture-only mutation for Theme Lab. Replace with server bootstrap later. */
	setContext(context: HcmRuntimeContext): void {
		this._context.set(context)
	}

	/** Merge in-memory presentation preferences without persisting credentials or tenant data. */
	updatePreferences(patch: Partial<HcmRuntimeContext['preferences']>): void {
		this._context.update(
			/** Preserve unrelated context and preference values. */ (current) => ({
				...current,
				preferences: { ...current.preferences, ...patch },
			}),
		)
	}

	/** Change fixture branding; the caller must validate the color before accepting it. */
	setPrimaryColor(primaryColor: string | undefined): void {
		this._context.update(
			/** Preserve tenant identity while replacing the optional accent. */ (current) => ({
				...current,
				tenant: { ...current.tenant, primaryColor },
			}),
		)
	}

	/** Simulate roles for presentation testing only; this never grants backend permission. */
	toggleRole(role: HcmRole): void {
		const current = this.context()
		const roles = new Set(current.principal.roles)
		if (roles.has(role)) roles.delete(role)
		else roles.add(role)
		this.setContext({ ...current, principal: { ...current.principal, roles: [...roles] } })
	}

	/** Simulate licensed capabilities without bypassing any server-side authorization. */
	toggleEntitlement(entitlement: HcmEntitlement): void {
		const current = this.context()
		const entitlements = new Set(current.principal.entitlements)
		if (entitlements.has(entitlement)) entitlements.delete(entitlement)
		else entitlements.add(entitlement)
		this.setContext({
			...current,
			principal: { ...current.principal, entitlements: [...entitlements] },
		})
	}

	/** Restore the original demo principal and presentation defaults after a lab experiment. */
	resetFixture(): void {
		this.setContext(DEMO_CONTEXT)
	}
}
