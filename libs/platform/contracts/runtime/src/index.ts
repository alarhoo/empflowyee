export type RuntimeEnvironment = 'local' | 'dev' | 'qa' | 'prod'

export interface RuntimeMetadata {
	environment: RuntimeEnvironment
	releaseId: string
}

export interface BrowserRuntimeConfig extends RuntimeMetadata {
	apiBaseUrl: string
}

export interface NodeRuntimeConfig extends RuntimeMetadata {
	port: number
}

/** Reject missing or invalid metadata without including environment values in error messages. */
export function parseRuntimeMetadata(value: unknown): Readonly<RuntimeMetadata> {
	if (!value || typeof value !== 'object')
		throw new Error('Runtime configuration must be an object')
	const { environment, releaseId } = value as Record<string, unknown>
	if (!['local', 'dev', 'qa', 'prod'].includes(environment as string)) {
		throw new Error('Invalid runtime environment')
	}
	if (typeof releaseId !== 'string' || !releaseId.trim() || releaseId.length > 128) {
		throw new Error('Invalid runtime release ID')
	}
	return Object.freeze({ environment: environment as RuntimeEnvironment, releaseId })
}

/** Validate the public browser contract and discard undeclared fields so secrets cannot propagate through it. */
export function parseBrowserRuntimeConfig(value: unknown): Readonly<BrowserRuntimeConfig> {
	const metadata = parseRuntimeMetadata(value)
	const { apiBaseUrl } = value as Record<string, unknown>
	if (typeof apiBaseUrl !== 'string' || apiBaseUrl !== apiBaseUrl.trim()) {
		throw new Error('Invalid public API URL')
	}
	let url: URL
	try {
		url = new URL(apiBaseUrl)
	} catch {
		throw new Error('Invalid public API URL')
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error('Invalid public API URL')
	}
	if (metadata.environment !== 'local' && url.protocol !== 'https:') {
		throw new Error('Deployed public API URLs require HTTPS')
	}
	return Object.freeze({ ...metadata, apiBaseUrl })
}

/** Validate process-boundary settings; development defaults never apply to production processes. */
export function parseNodeRuntimeConfig(
	env: Readonly<Record<string, string | undefined>>,
	localPort = 8080,
): Readonly<NodeRuntimeConfig> {
	const local =
		env['NODE_ENV'] !== 'production' &&
		(!env['APP_ENVIRONMENT'] || env['APP_ENVIRONMENT'] === 'local')
	const metadata = parseRuntimeMetadata({
		environment: env['APP_ENVIRONMENT'] ?? (local ? 'local' : undefined),
		releaseId: env['RELEASE_ID'] ?? (local ? 'local' : undefined),
	})
	const rawPort = env['PORT'] ?? String(local ? localPort : 8080)
	if (!/^\d+$/.test(rawPort)) throw new Error('Invalid PORT')
	const port = Number(rawPort)
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
	return Object.freeze({ ...metadata, port })
}
