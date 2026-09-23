import type { HcmRuntimeContext, TenantDiscoveryResponse } from './hcm-runtime-contract'

/** Require an object at a runtime trust boundary without retaining potentially sensitive payloads in errors. */
function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid HCM runtime response')
	return value as Record<string, unknown>
}

/** Reject absent identity labels and malformed presentation values. */
function text(value: unknown): asserts value is string {
	if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid HCM runtime response')
}

/** Validate access and authentication identifier lists before exposing them to computed policies. */
function strings(value: unknown): void {
	if (!Array.isArray(value)) throw new Error('Invalid HCM runtime response')
	for (const item of value) text(item)
}

/** Validate preference values without interpreting them as employment-domain rules. */
function preferences(value: unknown): void {
	const prefs = record(value)
	for (const key of ['language', 'locale', 'timezone', 'dateFormat', 'numberFormat']) {
		if (prefs[key] !== undefined) text(prefs[key])
	}
	if (
		prefs['theme'] !== undefined &&
		!['horizon-light', 'horizon-dark', 'her-light', 'her-dark'].includes(String(prefs['theme']))
	)
		throw new Error('Invalid HCM runtime response')
	if (prefs['density'] !== undefined && !['cozy', 'compact'].includes(String(prefs['density'])))
		throw new Error('Invalid HCM runtime response')
	if (prefs['timeFormat'] !== undefined && !['12h', '24h'].includes(String(prefs['timeFormat'])))
		throw new Error('Invalid HCM runtime response')
	for (const key of ['language', 'locale'])
		if (prefs[key] !== undefined) Intl.getCanonicalLocales(String(prefs[key]))
	if (prefs['timezone'] !== undefined)
		new Intl.DateTimeFormat('en', { timeZone: String(prefs['timezone']) }).format(0)
}

/** Validate safe tenant presentation before native controls and theme services consume it. */
function tenant(value: unknown): void {
	const presentation = record(value)
	text(presentation['slug'])
	text(presentation['displayName'])
	if (
		!['trial', 'active', 'grace', 'suspended', 'deactivated'].includes(
			String(presentation['status']),
		) ||
		typeof presentation['allowUserTheme'] !== 'boolean'
	)
		throw new Error('Invalid HCM runtime response')
	if (
		presentation['primaryColor'] !== undefined &&
		!/^#[a-fA-F0-9]{6}$/.test(String(presentation['primaryColor']))
	)
		throw new Error('Invalid HCM runtime response')
	if (presentation['logoUrl'] !== undefined) {
		text(presentation['logoUrl'])
		const url = new URL(presentation['logoUrl'], 'https://local.invalid')
		if (
			url.protocol !== 'https:' ||
			url.username ||
			url.password ||
			presentation['logoUrl'].startsWith('//')
		)
			throw new Error('Invalid HCM runtime response')
	}
	preferences(presentation['defaults'])
}

/** Freeze the JSON response recursively so feature consumers cannot mutate effective runtime authority. */
function freezeJson(value: unknown): void {
	if (value && typeof value === 'object') {
		for (const child of Object.values(value)) freezeJson(child)
		Object.freeze(value)
	}
}

/** Validate and freeze safe discovery JSON before it can enter the shell state machine. */
export function parseHcmTenantDiscovery(value: unknown): TenantDiscoveryResponse {
	const discovery = record(value)
	tenant(discovery['tenant'])
	const authentication = record(discovery['authentication'])
	strings(authentication['strategies'])
	if (
		authentication['loginPath'] !== undefined &&
		!/^\/api\/v1\/auth\/[a-zA-Z0-9/_-]+$/.test(String(authentication['loginPath']))
	)
		throw new Error('Invalid HCM runtime response')
	freezeJson(value)
	return value as TenantDiscoveryResponse
}

/** Validate session JSON independently of TypeScript types before granting presentation access. */
export function parseHcmRuntimeContext(value: unknown): HcmRuntimeContext {
	const context = record(value)
	tenant(context['tenant'])
	const user = record(context['user'])
	text(user['id'])
	text(user['displayName'])
	if (user['email'] !== undefined) text(user['email'])
	const access = record(context['access'])
	for (const key of ['roles', 'permissions', 'entitlements', 'featureFlags']) strings(access[key])
	preferences(context['preferences'])
	const session = record(context['session'])
	if (context['development'] !== undefined) {
		const development = record(context['development'])
		text(development['personaId'])
		if (
			typeof development['catalogueInspection'] !== 'boolean' ||
			!Array.isArray(development['personas'])
		)
			throw new Error('Invalid HCM runtime response')
		for (const value of development['personas']) {
			const persona = record(value)
			text(persona['id'])
			text(persona['displayName'])
			text(persona['roleLabel'])
		}
	}
	text(session['version'])
	if (
		session['expiresAt'] !== undefined &&
		(!Number.isFinite(Date.parse(String(session['expiresAt']))) ||
			Date.parse(String(session['expiresAt'])) <= Date.now())
	)
		throw new Error('Invalid HCM runtime response')
	freezeJson(value)
	return value as HcmRuntimeContext
}
