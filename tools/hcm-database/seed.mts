import { resolve } from 'node:path'
import { loadSqlMigrations } from '../../libs/hcm/api/database/migrations/src/lib/hcm-api-database-migrations.ts'
import { runDevelopmentSeeds } from '../../libs/hcm/api/database/seed/src/lib/hcm-api-database-seed.ts'

/** Execute only the canonical seed inventory and require an exact confirmation for reset. */
async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const reset =
		args.length === 2 && args[0] === '--reset' && args[1] === '--confirm=local-dunder-mifflin'
	if (args.length && !reset) throw new Error('Unknown seed command options')
	const modules = await runDevelopmentSeeds({
		env: process.env,
		manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
		migrations: await loadSqlMigrations(resolve('libs/hcm/api/database/migrations/sql')),
		mode: reset ? 'reset' : 'apply',
		resetConfirmation: reset ? 'local-dunder-mifflin' : undefined,
	})
	console.log(
		`Dunder Mifflin seed ${reset ? 'reset' : 'apply'} complete: ${modules.length} module versions changed.`,
	)
}

try {
	await main()
} catch {
	console.error(
		'HCM development seed failed. Verify local target flags, database marker, migrations and immutable manifest. SQL and credentials are suppressed.',
	)
	process.exitCode = 1
}
