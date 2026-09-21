import { killPort } from '@nx/node/utils'

/** Stop the process listening on the configured API test port after the suite completes. */
module.exports = async function globalTeardown() {
	const port = process.env.PORT ? Number(process.env.PORT) : 3000
	await killPort(port)
	console.log('\nTearing down...\n')
}
