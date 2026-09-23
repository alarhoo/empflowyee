/** Require an explicitly selected local target before any database connection is attempted. */
export function seedConnection(env: Readonly<Record<string, string | undefined>>): string {
	if (
		env['APP_ENVIRONMENT'] !== 'local' ||
		!['development', 'test'].includes(env['NODE_ENV'] ?? '') ||
		env['HCM_SEED_TARGET'] !== 'local-dunder-mifflin' ||
		[
			'K_SERVICE',
			'K_REVISION',
			'K_JOB',
			'CLOUD_RUN_JOB',
			'GAE_ENV',
			'KUBERNETES_SERVICE_HOST',
			'WEBSITE_INSTANCE_ID',
			'AWS_LAMBDA_FUNCTION_NAME',
		].some(
			/** Cloud activation markers disqualify local tooling even if other flags are forged. */ (
				key,
			) => Boolean(env[key]),
		)
	)
		throw new Error('Seed target is not approved local development')
	const connection = env['HCM_SEED_DATABASE_URL']
	if (!connection) throw new Error('HCM_SEED_DATABASE_URL is required')
	let url: URL
	try {
		url = new URL(connection)
	} catch {
		throw new Error('Invalid local seed connection')
	}
	if (
		!['postgres:', 'postgresql:'].includes(url.protocol) ||
		!['127.0.0.1', '[::1]'].includes(url.hostname) ||
		url.username !== 'hcm_migrator' ||
		!url.password ||
		url.pathname !== '/hcm_db' ||
		url.search ||
		url.hash
	)
		throw new Error('Seed connection must target the local hcm_db migrator without URI overrides')
	return connection
}
