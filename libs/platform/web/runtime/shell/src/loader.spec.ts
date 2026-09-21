import { expect, it, vi } from 'vitest'
import { loadRuntimeConfig } from './loader'

it('loads a fresh validated configuration before bootstrap', /** Verify the config request bypasses caches and uses the public endpoint. */ async () => {
	const response = Response.json({
		environment: 'local',
		releaseId: 'local',
		apiBaseUrl: 'http://localhost:4402/api',
	})
	const fetchConfig = vi.fn<typeof fetch>().mockResolvedValue(response)
	await expect(loadRuntimeConfig(fetchConfig)).resolves.toMatchObject({ environment: 'local' })
	expect(fetchConfig).toHaveBeenCalledWith(
		'/assets/config.json',
		expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
	)
})

it('rejects unavailable and malformed configuration', /** Keep startup blocked when HTTP succeeds with an invalid payload or fails outright. */ async () => {
	const fetchConfig = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))
	await expect(loadRuntimeConfig(fetchConfig)).rejects.toThrow('unavailable')
	fetchConfig.mockResolvedValue(Response.json({ environment: 'prod' }))
	await expect(loadRuntimeConfig(fetchConfig)).rejects.toThrow()
})
