import type { HcmAccessContext } from '@empflowyee/hcm-runtime-contract'
import { HCM_CATALOGUE } from '@empflowyee/hcm-runtime-contract/catalogue'
import { HCM_FEATURES } from './hcm-catalog.fixture'
import { canAccessHcmFeature, getVisibleHcmSpaces } from './hcm-catalog.filter'
import { searchHcmApplications } from './hcm-catalog.search'

const employee: HcmAccessContext = {
	roles: ['employee'],
	permissions: HCM_CATALOGUE.apps
		.filter(
			/** Select the canonical employee catalogue for discovery tests. */ (app) =>
				app.catalogueIds.includes('employee-self-service'),
		)
		.map(/** Extract explicit discovery permissions. */ (app) => app.discoveryPolicy.permission),
	entitlements: HCM_CATALOGUE.domains.map(
		/** License all domains independently of user permissions. */ (domain) =>
			`hcm.${domain.domain}`,
	),
	featureFlags: [],
}

it('exposes every app in inspection without granting route access', /** Cover all canonical placements and deny all currently planned business routes. */ () => {
	const spaces = getVisibleHcmSpaces(employee, undefined, undefined, true)
	expect(spaces).toHaveLength(5)
	expect(spaces.flatMap(/** Count all canonical pages. */ (space) => space.pages)).toHaveLength(20)
	expect(searchHcmApplications('', spaces)).toHaveLength(171)
	for (const feature of HCM_FEATURES.filter(
		/** Inspect only apps not yet released. */ (item) => !item.available,
	))
		expect(canAccessHcmFeature(feature, employee)).toBe(false)
})

it('filters persona discovery through roles, permissions and entitlements independently', /** A role or inspection cannot turn a planned app into an authorized route. */ () => {
	expect(
		getVisibleHcmSpaces(employee).map(
			/** Inspect the allowed primary navigation identity. */ (space) => space.id,
		),
	).toEqual(['employee'])
	expect(getVisibleHcmSpaces({ ...employee, permissions: [] })).toEqual([])
	expect(getVisibleHcmSpaces({ ...employee, entitlements: [] })).toEqual([])
	expect(getVisibleHcmSpaces({ ...employee, roles: [] })).toEqual([])
})

it('searches titles, app codes, domains and groups without duplicating or revealing hidden apps', /** Exercise cross-Space search and metadata matching with real canonical entries. */ () => {
	const all = getVisibleHcmSpaces(employee, undefined, undefined, true)
	expect(
		searchHcmApplications('PAYROLL_RUNS', all).map(
			/** Inspect matching app codes. */ (app) => app.id,
		),
	).toEqual(['PAYROLL_RUNS'])
	expect(
		searchHcmApplications('payroll', getVisibleHcmSpaces(employee)).some(
			/** Detect a forbidden payroll operations result. */ (app) => app.id === 'PAYROLL_RUNS',
		),
	).toBe(false)
	expect(
		searchHcmApplications('information service', all).some(
			/** Search group labels as well as app titles. */ (app) => app.id === 'MY_SECURITY',
		),
	).toBe(true)
	expect(searchHcmApplications('no-such-application', all)).toEqual([])
	const results = searchHcmApplications('directory', all)
	expect(
		new Set(
			results.map(/** Collect result identities to detect repeated placements. */ (app) => app.id),
		).size,
	).toBe(results.length)
})
