import type {
	HcmRuntimeContext,
	RuntimeFailure,
	TenantDiscoveryResponse,
} from '@empflowyee/hcm-runtime-contract'
export type {
	HcmRuntimeContext,
	HcmPreferences,
	HcmThemeVariant,
} from '@empflowyee/hcm-runtime-contract'

export type HcmRuntimeState =
	| { kind: 'tenant-loading' }
	| { kind: 'tenant-not-found' }
	| { kind: 'tenant-suspended'; discovery: TenantDiscoveryResponse }
	| { kind: 'auth-required'; discovery: TenantDiscoveryResponse }
	| { kind: 'session-loading'; discovery: TenantDiscoveryResponse }
	| { kind: 'ready'; context: HcmRuntimeContext }
	| { kind: 'error'; failure: RuntimeFailure }
