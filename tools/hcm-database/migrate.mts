import { resolve } from 'node:path'
import { migrateHcmDatabase } from '../../libs/hcm/api/database/migrations/src/lib/hcm-api-database-migrations.ts'

/** Run only when explicitly invoked; print safe counts without SQL or connection diagnostics. */
async function main(): Promise<void> {
	const connection = process.env['HCM_MIGRATION_DATABASE_URL']
	if (!connection) throw new Error('HCM_MIGRATION_DATABASE_URL is required')
	const applied = await migrateHcmDatabase(
		connection,
		resolve('libs/hcm/api/database/migrations/sql'),
	)
	console.log(`HCM migrations complete: ${applied.length} applied.`)
}

try {
	await main()
} catch {
	console.error(
		'HCM migration failed. Check connection configuration, role, SQL inventory and migration history; no credentials or SQL diagnostics are logged.',
	)
	process.exitCode = 1
}
