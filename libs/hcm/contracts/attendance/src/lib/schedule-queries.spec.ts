import { expect, it } from 'vitest'
import { parseScheduleListQuery, parseScheduleVersionQuery } from './schedule-queries'

it('normalizes allowlisted sort defaults while preserving literal filters', /** Bounded server query controls cannot carry undeclared scope or arbitrary persistence columns. */ () => {
	expect(parseScheduleListQuery(new URLSearchParams())).toEqual({
		limit: 25,
		sort: 'code',
		direction: 'asc',
	})
	expect(
		parseScheduleListQuery(new URLSearchParams('sort=name&name=%20Office%20&limit=100')),
	).toEqual({ limit: 100, sort: 'name', direction: 'asc', name: ' Office ' })
	for (const query of [
		'q=free',
		'limit=0',
		'limit=101',
		'limit=1&limit=2',
		'sort=created_at',
		'sort=name:ASC',
		'state=Pending',
		'tenantId=forged',
		'cursor=unsigned-json',
	]) {
		expect(
			/** Reject invalid controls before a repository handles pagination. */ () =>
				parseScheduleListQuery(new URLSearchParams(query)),
		).toThrow()
	}
})

it('requires explicit versions for content mutations but permits latest-version GET', /** Unknown and repeated selectors never silently choose another draft. */ () => {
	expect(parseScheduleVersionQuery(new URLSearchParams())).toBeUndefined()
	expect(parseScheduleVersionQuery(new URLSearchParams('version=v1'), true)).toBe('v1')
	for (const query of ['', 'version=', 'version=v1&version=v2', 'version=v1&state=Published']) {
		expect(
			/** A mutation must name one exact declared version. */ () =>
				parseScheduleVersionQuery(new URLSearchParams(query), true),
		).toThrow()
	}
})
