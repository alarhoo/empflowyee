import { Injectable, computed, signal } from '@angular/core'
import { HcmRuntimeContext } from './hcm-runtime.models'

const DEMO_CONTEXT: HcmRuntimeContext = {
	tenant: {
		tenantId: 'tenant-acme-demo',
		slug: 'acme',
		displayName: 'Acme Corporation',
		defaultTheme: 'her-light',
		primaryColor: '#b74435',
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
		/** Expose the fixture tenant's presentation context. */ () => this._context().tenant,
	)
	readonly principal = computed(
		/** Expose the fixture principal without authenticating a user. */ () =>
			this._context().principal,
	)
	readonly preferences = computed(
		/** Expose optional user presentation preferences. */ () => this._context().preferences,
	)
	readonly roles = computed(
		/** Index roles for catalog visibility checks. */ () => new Set(this.principal().roles),
	)
	readonly entitlements = computed(
		/** Index licensed capabilities for catalog visibility checks. */ () =>
			new Set(this.principal().entitlements),
	)

	/** Fixture-only mutation for Theme Lab. Replace with server bootstrap later. */
	setContext(context: HcmRuntimeContext): void {
		this._context.set(context)
	}

	/** Merge optional user preferences into the fixture context. */ updatePreferences(
		patch: Partial<HcmRuntimeContext['preferences']>,
	): void {
		this._context.update(
			/** Preserve unrelated context fields while merging preferences. */ (current) => ({
				...current,
				preferences: { ...current.preferences, ...patch },
			}),
		)
	}
}
