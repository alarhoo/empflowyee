import type { TenantLifecycleStatus } from '@empflowyee/hcm-runtime-contract'

/** Safe current-tenant routing projection; Account remains authoritative. */
export interface DomainProjection {
	hostnames: { hostname: string }[]
	tenantSlug: string
	tenantStatus: TenantLifecycleStatus
	source: 'account-projection'
}
