import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { checkPageStructure } from './page-structure.mjs'

test('requires native forms for business object details', /** Prevent definition lists from bypassing maintained UI5 field layout and accessibility. */ () => {
	const template = {
		file: 'libs/hcm/web/access-control/feature-roles/detail.html',
		selector: 'role-detail',
		content: '<dl><dt>Name</dt><dd>Employee</dd></dl>',
	}
	assert.equal(checkPageStructure([template]).length, 3)
	template.content =
		'<ui5-form><ui5-form-item><ui5-label slot="labelContent">Name</ui5-label><ui5-text>Employee</ui5-text></ui5-form-item></ui5-form>'
	assert.deepEqual(checkPageStructure([template]), [])
})

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
