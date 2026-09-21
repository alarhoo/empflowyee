import { waitForPortOpen } from '@nx/node/utils'

module.exports = async function globalSetup() {
	// Start services that that the app needs to run (e.g. database, docker-compose, etc.).
	console.log('\nSetting up...\n')

	const host = process.env.HOST ?? 'localhost'
	const port = process.env.PORT ? Number(process.env.PORT) : 3000
	await waitForPortOpen(port, { host })
}
