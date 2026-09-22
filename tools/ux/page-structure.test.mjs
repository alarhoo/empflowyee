import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { checkPageStructure } from './page-structure.mjs'

test('requires a page header but permits an omitted footer', /** Distinguish mandatory page anatomy from optional actions. */ () => {
	assert.equal(
		checkPageStructure([
			{ file: 'page.html', selector: 'sample', content: '<ui5-page>Content</ui5-page>' },
		]).length,
		1,
	)
	assert.deepEqual(
		checkPageStructure([
			{
				file: 'page.html',
				selector: 'sample',
				content: '<ui5-page><ui5-bar slot="header">Title</ui5-bar>Content</ui5-page>',
			},
		]),
		[],
	)
})

test('rejects bare FCL content and accepts a page-backed feature', /** Follow projected column hosts without requiring redundant nested pages. */ () => {
	const page = {
		file: 'profile.html',
		selector: 'sample-profile',
		content: '<ef-hcm-object-page title="Profile" />',
	}
	const layout = {
		file: 'layout.html',
		selector: 'sample-layout',
		content:
			'<ui5-flexible-column-layout>@if (true) {<ui5-list slot="startColumn" />}</ui5-flexible-column-layout>',
	}
	assert.equal(checkPageStructure([page, layout]).length, 1)
	layout.content =
		'<ui5-flexible-column-layout><sample-profile slot="midColumn" /></ui5-flexible-column-layout>'
	assert.deepEqual(checkPageStructure([page, layout]), [])
})
