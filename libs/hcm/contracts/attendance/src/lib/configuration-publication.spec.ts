import { expect, it } from 'vitest'
import { parseConfigurationPreview, parseConfigurationPublish } from './configuration-publication'

it('bounds explicit preview dates without inventing a wider missing end', /** Inclusive leap-year and reversed/nonexistent dates are validated independently of server impact calculations. */ () => {
	expect(parseConfigurationPreview({ expectedRevision: 1, effectiveFrom: '2028-02-29' })).toEqual({
		expectedRevision: 1,
		effectiveFrom: '2028-02-29',
		effectiveTo: '2028-02-29',
	})
	expect(
		parseConfigurationPreview({
			expectedRevision: 1,
			effectiveFrom: '2028-01-01',
			effectiveTo: '2028-12-31',
		}).effectiveTo,
	).toBe('2028-12-31')
	for (const patch of [
		{ effectiveFrom: '2026-02-29' },
		{ effectiveTo: '2027-01-02' },
		{ effectiveTo: '2025-12-31' },
		{ expectedRevision: 0 },
		{ actorId: 'forged' },
	]) {
		expect(
			/** Reject invalid calendar values, over-wide ranges and undeclared identity selectors. */ () =>
				parseConfigurationPreview({ expectedRevision: 1, effectiveFrom: '2026-01-01', ...patch }),
		).toThrow()
	}
})

it('preserves publication reasons and rejects malformed evidence or hidden lifecycle fields', /** Publishing requires an exact revision, preview and digest; transport cannot submit Published as a shortcut. */ () => {
	const input = {
		expectedRevision: 3,
		previewId: 'preview-id',
		digest: 'a'.repeat(64),
		reason: '  Reviewed pattern\nwith explicit breaks  ',
	}
	expect(parseConfigurationPublish(input)).toEqual(input)
	for (const patch of [
		{ digest: 'a'.repeat(63) },
		{ reason: ' ' },
		{ reason: 'a'.repeat(2001) },
		{ previewId: '' },
		{ state: 'Published' },
		{ actorId: 'forged' },
	]) {
		expect(
			/** Keep proof fields mandatory and reasons bounded without silently trimming evidence. */ () =>
				parseConfigurationPublish({ ...input, ...patch }),
		).toThrow()
	}
})
