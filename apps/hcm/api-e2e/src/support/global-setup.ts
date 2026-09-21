import { waitForPortOpen } from '@nx/node/utils'

/** Wait for the configured API host and port to accept connections before the end-to-end suite starts. */
module.exports = async function globalSetup() {
	console.log('\nSetting up...\n')

	const host = process.env.HOST ?? 'localhost'
	const port = process.env.PORT ? Number(process.env.PORT) : 3000
	await waitForPortOpen(port, { host })
}
