import { existsSync, readFileSync } from 'node:fs'

const catalog = readJson('tools/ux/floorplan-catalog.json')
const ids = new Set()
for (const pattern of catalog.patterns) {
	if (ids.has(pattern.id)) throw new Error('Duplicate floorplan ID: ' + pattern.id)
	ids.add(pattern.id)
	if (!['canonical', 'review-required'].includes(pattern.status)) continue
	const project = readJson(pattern.projectFile)
	if (project.name !== pattern.nxLibrary) throw new Error('Mismatched project: ' + pattern.id)
	for (const tag of ['product:hcm', 'runtime:web', 'domain:ux', 'type:floorplan']) {
		if (!project.tags.includes(tag)) throw new Error('Missing boundary tag: ' + tag)
	}
	for (const path of [pattern.exampleSource, pattern.storySource, pattern.validation]) {
		if (!existsSync(path)) throw new Error('Missing production/acceptance source: ' + path)
	}
	const example = readFileSync(pattern.exampleSource, 'utf8')
	if (!example.includes('@empflowyee/' + pattern.nxLibrary))
		throw new Error('Example must import its production floorplan')
	const story = readFileSync(pattern.storySource, 'utf8')
	if (pattern.status === 'review-required' && !story.includes('hcmReview:'))
		throw new Error('Unapproved proof must display its acceptance notice: ' + pattern.id)
	if (/\btemplate\s*:/.test(story))
		throw new Error('Canonical stories must not implement an alternate layout')
}
const app = readJson('apps/hcm/web/project.json')
for (const target of ['storybook', 'build-storybook', 'test-storybook', 'static-storybook']) {
	if (!app.targets[target]) throw new Error('Missing HCM target: ' + target)
}
for (const target of ['storybook', 'build-storybook']) {
	if (app.targets[target].options.experimentalZoneless !== false)
		throw new Error('Preserve Zone.js compatibility')
}
console.log(
	'Canonical production references and Nx tags verified. Run browser acceptance; source counts do not establish UX quality.',
)

/** Read repository configuration without treating generated artifacts as architectural evidence. */
function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'))
}
