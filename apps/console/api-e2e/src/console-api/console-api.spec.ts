import axios from 'axios'

describe('GET /api', /** Group the console API root-endpoint smoke checks. */ () => {
	it('should return a message', /** Request the running API and verify its successful scaffold response. */ async () => {
		const res = await axios.get('/api')

		expect(res.status).toBe(200)
		expect(res.data).toEqual({ message: 'Hello API' })
	})
})
