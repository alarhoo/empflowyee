import { execFileSync } from 'node:child_process'
import { chmod, lstat, mkdir, readdir, readFile, realpath, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Client } from 'pg'
import { seedConnection } from '../../libs/hcm/api/database/seed/src/lib/seed-target.ts'

const root = resolve('.local/hcm/documents')
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
/** Reject symlink/junction ancestors before any local provisioning or cleanup side effect. */
async function checkDirectory(path: string): Promise<void> {
	const parent = dirname(path)
	if (parent !== path) await checkDirectory(parent)
	const stat = await lstat(path)
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		resolve(await realpath(path)).toLowerCase() !== path.toLowerCase()
	)
		throw new Error('Private document directory is not canonical')
}
/** Execute only explicit local storage maintenance, never automatically from API bootstrap. */
async function main(): Promise<void> {
	const command = process.argv[2]
	if (!['prepare', 'inspect', 'cleanup'].includes(command ?? '') || process.argv.length !== 3)
		throw new Error('Usage: documents-local.mts prepare|inspect|cleanup')
	seedConnection({
		...process.env,
		APP_ENVIRONMENT: process.env['APP_ENVIRONMENT'] ?? 'local',
		NODE_ENV: process.env['NODE_ENV'] ?? 'development',
		HCM_SEED_TARGET: 'local-dunder-mifflin',
		HCM_SEED_DATABASE_URL: 'postgresql://hcm_migrator:validation-only@127.0.0.1:55432/hcm_db',
	})
	await checkDirectory(dirname(root))
	if (command === 'prepare') {
		await mkdir(root, { recursive: true, mode: 0o700 })
		await checkDirectory(root)
		if (process.platform === 'win32') {
			const user = execFileSync('whoami', [], { encoding: 'utf8', windowsHide: true }).trim()
			execFileSync('icacls', [root, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], {
				stdio: 'ignore',
				windowsHide: true,
			})
		} else await chmod(root, 0o700)
		for (const area of ['staging', 'blobs']) {
			await mkdir(join(root, area), { recursive: true, mode: 0o700 })
			await checkDirectory(join(root, area))
		}
		console.log('Private local document storage prepared; no business records changed.')
		return
	}
	await checkDirectory(root)
	const config = JSON.parse(await readFile(resolve('.local/hcm/database.json'), 'utf8'))
	if (config.port !== 55432 || !/^[a-f0-9]{64}$/.test(config.adminPassword))
		throw new Error('Invalid local database configuration')
	// This explicit operator command needs an all-tenant reference inventory before deleting an orphan.
	// It uses the existing local administrator credential; business runtime never receives it.
	const database = new Client({
		host: '127.0.0.1',
		port: config.port,
		database: 'hcm_db',
		user: 'postgres',
		password: config.adminPassword,
	})
	await database.connect()
	try {
		await database.query('BEGIN')
		const tenants = (await database.query('SELECT id FROM hcm.tenant ORDER BY id')).rows
		for (const tenant of tenants)
			await database.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [tenant.id])
		const attempts = (
			await database.query(
				"SELECT tenant_id,id,blob_id FROM hcm.document_upload_attempt WHERE state='Staged' AND created_at<now()-interval '24 hours'",
			)
		).rows
		let abandoned = 0
		if (command === 'cleanup')
			for (const attempt of attempts) {
				await database.query(
					"UPDATE hcm.document_upload_attempt SET state='Failed' WHERE tenant_id=$1 AND id=$2 AND state='Staged'",
					[attempt.tenant_id, attempt.id],
				)
				await database.query(
					"UPDATE hcm.document_blob SET state='Failed' WHERE tenant_id=$1 AND id=$2 AND state='Staged'",
					[attempt.tenant_id, attempt.blob_id],
				)
				abandoned++
			}
		const blobs = (await database.query('SELECT storage_key,state FROM hcm.document_blob')).rows
		const references = new Set(
			blobs.map(
				/** Protect all metadata references, including failed evidence. */ (row) =>
					row.storage_key as string,
			),
		)
		const found = new Set<string>()
		let oldOrphans = 0,
			removed = 0
		for (const area of ['staging', 'blobs']) {
			const folder = join(root, area)
			await checkDirectory(folder)
			for (const name of await readdir(folder)) {
				if (!keyPattern.test(name))
					throw new Error('Unexpected entry in private storage; inspect manually')
				const path = resolve(folder, name)
				if (dirname(path) !== folder) throw new Error('Unsafe cleanup candidate')
				const stat = await lstat(path)
				if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
					throw new Error('Linked or non-file storage entry; cleanup refused')
				if (area === 'blobs') found.add(name)
				if (references.has(name) || stat.mtimeMs > Date.now() - 86400000) continue
				oldOrphans++
				if (command === 'cleanup') {
					const referenced = (
						await database.query('SELECT 1 FROM hcm.document_blob WHERE storage_key=$1::uuid', [
							name,
						])
					).rowCount
					await checkDirectory(folder)
					const current = await lstat(path)
					if (
						!referenced &&
						current.isFile() &&
						!current.isSymbolicLink() &&
						current.nlink === 1 &&
						current.ino === stat.ino &&
						current.mtimeMs === stat.mtimeMs
					) {
						await unlink(path)
						removed++
					}
				}
			}
		}
		const missingReady = blobs.filter(
			/** Report missing Ready bytes without repairing or deleting business metadata. */ (row) =>
				row.state === 'Ready' && !found.has(row.storage_key),
		).length
		await database.query('COMMIT')
		console.log(
			JSON.stringify({
				command,
				abandonedCandidates: attempts.length,
				markedFailed: abandoned,
				oldUnreferencedFiles: oldOrphans,
				removed,
				missingReady,
			}),
		)
	} catch (error) {
		await database.query('ROLLBACK')
		throw error
	} finally {
		await database.end()
	}
}
void main().catch(
	/** Avoid printing credentials, query parameters or private filenames. */ () => {
		console.error(
			'Local document maintenance failed; verify local configuration, database and private storage.',
		)
		process.exitCode = 1
	},
)
