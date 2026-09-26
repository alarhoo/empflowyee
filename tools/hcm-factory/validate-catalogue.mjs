import { appSlug, catalogue, launchpad } from './lib.mjs'

const errors = []
const codes = new Set()
const paths = new Set()
const allowedAppKeys = new Set([
	'appCode',
	'discoveryPolicy',
	'title',
	'titleStatus',
	'product',
	'runtime',
	'domain',
	'deliveryWave',
	'catalogueIds',
	'placements',
	'featurePath',
	'route',
	'floorplan',
	'fddStatus',
	'tddStatus',
	'blockingDecisionStatus',
	'implementationStatus',
	'dataPolicy',
	'themeContract',
	'customCssPolicy',
])

for (const app of catalogue.apps) {
	if (codes.has(app.appCode)) errors.push(`duplicate appCode ${app.appCode}`)
	codes.add(app.appCode)

	for (const key of Object.keys(app)) {
		if (!allowedAppKeys.has(key)) errors.push(`${app.appCode}: unsupported catalogue field ${key}`)
	}
	if (app.themeContract !== 'theme-agnostic')
		errors.push(`${app.appCode}: themeContract must be theme-agnostic`)
	if (app.dataPolicy !== 'real-api-only')
		errors.push(`${app.appCode}: dataPolicy must be real-api-only`)
	if (app.customCssPolicy !== 'forbidden-by-default')
		errors.push(`${app.appCode}: customCssPolicy must be forbidden-by-default`)
	if (typeof app.appCode !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(app.appCode))
		errors.push('invalid appCode')
	if (typeof app.domain !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(app.domain))
		errors.push(`${app.appCode}: invalid domain`)
	if (!/^HCM-[1-9]$/.test(app.deliveryWave))
		errors.push(`${app.appCode}: invalid business delivery wave`)
	if (
		typeof app.appCode !== 'string' ||
		app.featurePath !== `libs/hcm/web/${app.domain}/feature-${appSlug(app.appCode)}`
	)
		errors.push(`${app.appCode}: invalid featurePath`)
	if (paths.has(app.featurePath)) errors.push(`${app.appCode}: duplicate featurePath`)
	paths.add(app.featurePath)
	if (app.product !== 'hcm' || app.runtime !== 'web')
		errors.push(`${app.appCode}: invalid product/runtime`)
	if (!['planned', 'designing', 'implementing', 'complete'].includes(app.implementationStatus))
		errors.push(`${app.appCode}: invalid implementationStatus`)
	if (app.tddStatus !== 'approved' && (app.route !== null || app.floorplan !== null))
		errors.push(`${app.appCode}: route/floorplan require approved TDD`)
}

/** Index unique layout identifiers and report duplicates instead of silently overwriting them. */
function indexBy(entries, key) {
	const index = new Map()
	for (const entry of entries ?? []) {
		if (typeof entry[key] !== 'string' || !entry[key]) errors.push(`missing ${key}`)
		if (index.has(entry[key])) errors.push(`duplicate ${key} ${entry[key]}`)
		index.set(entry[key], entry)
	}
	return index
}

const spaces = indexBy(launchpad.spaces, 'spaceId')
const pages = indexBy(launchpad.pages, 'pageId')
const catalogues = indexBy(launchpad.businessCatalogues, 'catalogueId')
indexBy(launchpad.businessRoles, 'roleId')
const pageSpaces = new Map()
for (const space of spaces.values()) {
	for (const pageId of space.pageIds ?? []) {
		if (!pages.has(pageId)) errors.push(`${space.spaceId}: unknown page ${pageId}`)
		if (pageSpaces.has(pageId)) errors.push(`page ${pageId} assigned more than once`)
		pageSpaces.set(pageId, space.spaceId)
	}
}
const placements = new Map()
for (const page of pages.values()) {
	if (!pageSpaces.has(page.pageId)) errors.push(`unplaced page ${page.pageId}`)
	const sections = indexBy(page.sections, 'sectionId')
	for (const section of sections.values()) {
		const sectionCodes = new Set()
		for (const code of section.appCodes ?? []) {
			if (!codes.has(code)) errors.push(`launchpad references unknown app ${code}`)
			if (sectionCodes.has(code)) errors.push(`${section.sectionId}: duplicate app ${code}`)
			sectionCodes.add(code)
			const key = `${code}/${pageSpaces.get(page.pageId)}/${page.pageId}/${section.sectionId}`
			placements.set(key, section.display)
		}
	}
}
for (const entry of catalogues.values()) {
	const members = new Set()
	for (const code of entry.appCodes ?? []) {
		if (!codes.has(code)) errors.push(`${entry.catalogueId}: unknown app ${code}`)
		if (members.has(code)) errors.push(`${entry.catalogueId}: duplicate app ${code}`)
		members.add(code)
		const app = catalogue.apps.find(
			/** Resolve membership back to its canonical app. */ (candidate) =>
				candidate.appCode === code,
		)
		if (app && !app.catalogueIds?.includes(entry.catalogueId))
			errors.push(`${code}: missing catalogue membership ${entry.catalogueId}`)
	}
}
for (const role of launchpad.businessRoles ?? []) {
	for (const id of role.catalogueIds ?? [])
		if (!catalogues.has(id)) errors.push(`${role.roleId}: unknown catalogue ${id}`)
	for (const id of role.spaceIds ?? [])
		if (!spaces.has(id)) errors.push(`${role.roleId}: unknown space ${id}`)
}
for (const app of catalogue.apps) {
	for (const id of app.catalogueIds ?? [])
		if (!catalogues.get(id)?.appCodes.includes(app.appCode))
			errors.push(`${app.appCode}: invalid catalogue membership ${id}`)
	for (const placement of app.placements ?? []) {
		const key = `${app.appCode}/${placement.spaceId}/${placement.pageId}/${placement.sectionId}`
		if (!placements.has(key) || placements.get(key) !== placement.display)
			errors.push(`${app.appCode}: invalid placement ${key}`)
		placements.delete(key)
	}
}
for (const key of placements.keys()) errors.push(`missing app placement ${key}`)

if (launchpad.appCatalogue !== './hcm-app-catalogue.json')
	errors.push('launchpad must reference the canonical app catalogue')
if (launchpad.runtimeId !== 'hcm') errors.push('launchpad must use the hcm runtime')

if (catalogue.apps.length !== 171) errors.push(`expected 171 apps, found ${catalogue.apps.length}`)
if ((launchpad.spaces ?? []).length !== 5)
	errors.push(`expected 5 Spaces, found ${(launchpad.spaces ?? []).length}`)
if ((launchpad.pages ?? []).length !== 20)
	errors.push(`expected 20 Pages, found ${(launchpad.pages ?? []).length}`)

if (errors.length) {
	console.error(errors.join('\n'))
	process.exit(1)
}
console.log(
	`HCM catalogue OK: ${catalogue.apps.length} unique apps, 5 Spaces, 20 Pages, current metadata only.`,
)
