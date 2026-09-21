import axios from 'axios'

/** Set the shared Axios base URL from HOST and PORT for API end-to-end requests. */
module.exports = async function testSetup() {
	const host = process.env.HOST ?? 'localhost'
	const port = process.env.PORT ?? '3000'
	axios.defaults.baseURL = `http://${host}:${port}`
}
