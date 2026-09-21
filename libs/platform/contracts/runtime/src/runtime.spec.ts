import { describe, expect, it } from 'vitest'
import { parseBrowserRuntimeConfig, parseNodeRuntimeConfig } from './index'

describe('Runtime contracts', /** Exercise startup validation without using deployment secrets. */ () => {
	it('requires explicit production metadata and valid ports', /** Reject missing metadata and malformed listener settings. */ () => {
		expect(
			/** Attempt production startup without environment metadata. */ () =>
				parseNodeRuntimeConfig({ NODE_ENV: 'production' }),
		).toThrow()
		for (const PORT of ['0', '65536', '12x', '1.5', '-1', '']) {
			expect(
				/** Validate an invalid listener port. */ () => parseNodeRuntimeConfig({ PORT }),
			).toThrow('PORT')
		}
		expect(parseNodeRuntimeConfig({}, 4402)).toEqual({
			environment: 'local',
			releaseId: 'local',
			port: 4402,
		})
		expect(
			parseNodeRuntimeConfig({
				NODE_ENV: 'production',
				APP_ENVIRONMENT: 'qa',
				RELEASE_ID: 'release-1',
				PORT: '9080',
			}).port,
		).toBe(9080)
	})
	it('returns only approved public values', /** Drop unexpected fields and freeze the public contract. */ () => {
		const config = parseBrowserRuntimeConfig({
			environment: 'dev',
			releaseId: 'release-1',
			apiBaseUrl: 'https://api.example.test/api',
			secret: 'must-not-propagate',
		})
		expect(config).toEqual({
			environment: 'dev',
			releaseId: 'release-1',
			apiBaseUrl: 'https://api.example.test/api',
		})
		expect(Object.isFrozen(config)).toBe(true)
	})
	it('rejects malformed public endpoints', /** Prevent credentials, insecure deployed URLs and unsupported schemes. */ () => {
		for (const apiBaseUrl of [
			'javascript:alert(1)',
			'/api',
			'http://example.test',
			'https://user:password@example.test',
			'https://example.test?token=secret',
		]) {
			expect(
				/** Validate a disallowed public endpoint. */ () =>
					parseBrowserRuntimeConfig({ environment: 'prod', releaseId: 'release-1', apiBaseUrl }),
			).toThrow()
		}
	})
})
