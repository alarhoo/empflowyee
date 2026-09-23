import { Injectable, inject } from '@angular/core'
import { HcmRuntimeStore } from './hcm-runtime.store'

@Injectable({ providedIn: 'root' })
export class HcmAccessService {
	private readonly runtime = inject(HcmRuntimeStore)
	/** Check a capability only within a ready authenticated runtime. */
	hasPermission(permission: string): boolean {
		return this.runtime.context()?.access.permissions.includes(permission) ?? false
	}
	/** Require at least one of the supplied permissions. */
	hasAnyPermission(permissions: readonly string[]): boolean {
		return permissions.some(
			/** Test each candidate capability. */ (permission) => this.hasPermission(permission),
		)
	}
	/** Require all supplied permissions and a ready authenticated context. */
	hasAllPermissions(permissions: readonly string[]): boolean {
		return (
			!!this.runtime.context() &&
			permissions.every(
				/** Test every required capability. */ (permission) => this.hasPermission(permission),
			)
		)
	}
	/** Check licensed capability independently from roles and user permissions. */
	hasEntitlement(entitlement: string): boolean {
		return this.runtime.context()?.access.entitlements.includes(entitlement) ?? false
	}
}
