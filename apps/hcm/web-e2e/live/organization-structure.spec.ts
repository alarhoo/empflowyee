import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/**
 * Shared findings recorded outside this app: UI5 Display Form definition-list semantics
 * (docs/hcm/ux/floorplans/validation.md) and inverted positive ObjectStatus contrast
 * (docs/hcm/testing/HCM-1-DOCUMENT-REQUESTS-VALIDATION.md). Every other rule must pass.
 */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']

/** The native three-column FCL separator arrow has no public label API and sits inside the separator. */
function nativeFclFinding(target: unknown): boolean {
	const path = JSON.stringify(target)
	return (
		path.startsWith('[["ui5-flexible-column-layout",".ui5-fcl-arrow"') ||
		path === '[["ui5-flexible-column-layout",".ui5-fcl-separator-start"]]'
	)
}

/** Run axe on the feature and return violations other than the recorded shared findings. */
async function violations(page: Page): Promise<string[]> {
	const result = await new AxeBuilder({ page }).include('ef-hcm-organization-structure').analyze()
	return result.violations
		.filter(/** Keep app-attributable findings. */ (item) => !SHARED_FINDINGS.includes(item.id))
		.flatMap(
			/** Report each remaining node by rule and target. */ (item) =>
				item.nodes
					.filter(/** Drop native FCL internals only. */ (node) => !nativeFclFinding(node.target))
					.map(/** Identify the finding. */ (node) => `${item.id} ${JSON.stringify(node.target)}`),
		)
}

/** Switch to a seeded development persona through the real Settings dialog. */
async function persona(page: Page, name: string): Promise<void> {
	page.on(
		'pageerror',
		/** Surface component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	page.on(
		'response',
		/** Report failed real API calls during browser acceptance. */ (response) => {
			if (response.status() >= 400 && response.url().includes('/api/'))
				console.log('API FAILURE', response.status(), response.url())
		},
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name, exact: false }).click()
	await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
}

/** Open the admitted app through catalogue search, then one structure area. */
async function openArea(page: Page, area: string): Promise<void> {
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('ORGANIZATION_STRUCTURE')
	await page
		.getByRole('button', { name: /^Organization Structure/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/workforce-foundation\/organization-structure/)
	await page.getByRole('listitem', { name: new RegExp(`^${area} `) }).click()
	await expect(page).toHaveURL(/area=/)
}

/** Click a page action, opening the native overflow first on narrow layouts. */
async function action(page: Page, name: string, host: string): Promise<void> {
	const button = page.locator(host).getByRole('button', { name, exact: true })
	if (!(await button.isVisible()))
		await page
			.locator(host)
			.getByRole('button', { name: 'Additional Options', exact: true })
			.first()
			.click()
	await button.click()
}

/** Choose one server-filtered picker option by typing part of its name. */
async function pick(page: Page, scope: string, label: string, text: string): Promise<void> {
	const box = page.locator(scope).getByRole('combobox', { name: label, exact: true })
	await box.fill(text)
	await page
		.getByRole('option', { name: new RegExp(text) })
		.first()
		.click()
}

test('browses the effective-dated unit tree and inspects versions and usage', /** REQ-001: units display as a hierarchy at an as-of date with detail, versions and usage. */ async ({
	page,
}) => {
	await persona(page, 'David Wallace')
	await openArea(page, 'Units')
	await expect(page.getByRole('tree', { name: 'Unit hierarchy' })).toBeVisible()
	const company = page.getByRole('treeitem', { name: /^Dunder Mifflin/ }).first()
	await expect(company).toBeVisible()
	await company.focus()
	await page.keyboard.press('ArrowRight')
	const scranton = page.getByRole('treeitem', { name: /^Scranton Branch/ })
	await expect(scranton).toBeVisible()
	await scranton.click()
	const detail = page.locator('ef-hcm-structure-detail')
	await expect(detail.getByRole('heading', { name: 'Scranton Branch' }).first()).toBeVisible()
	await expect(detail.getByText('Dunder Mifflin (inherited)')).toBeVisible()
	await detail.getByRole('tab', { name: 'Versions', exact: true }).click()
	await expect(detail.getByText('Scranton Branch').first()).toBeVisible()
	await detail.getByRole('tab', { name: 'Usage', exact: true }).click()
	await expect(detail.getByText('Current assignments')).toBeVisible()
	expect(await violations(page)).toEqual([])
	const asOf = page.getByRole('textbox', { name: 'As of date', exact: true })
	await asOf.fill('Dec 31, 2004')
	await asOf.press('Enter')
	await expect(page).toHaveURL(/asOf=2004-12-31/)
	await expect(page.getByRole('treeitem', { name: /^Dunder Mifflin/ })).toHaveCount(0)
})

test('reads every area at supported widths without horizontal overflow', /** REQ-001 and REQ-008: truthful content, accessible at 390/768/1440/2560. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await persona(page, 'David Wallace')
	await openArea(page, 'Departments')
	await expect(page.getByRole('grid', { name: 'Departments' })).toBeVisible()
	await page.getByRole('row').filter({ hasText: 'Sales' }).first().click()
	await expect(
		page.locator('ef-hcm-structure-detail').getByRole('heading', { name: 'Sales' }).first(),
	).toBeVisible()
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(
			page.locator('ef-hcm-structure-detail').getByRole('heading', { name: 'Sales' }).first(),
		).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native table popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
	await page.setViewportSize({ width: 1440, height: 1000 })
	for (const [area, grid, row] of [
		['Legal entities', 'Legal entities', 'Dunder Mifflin'],
		['Unit types', 'Unit types', 'Branch'],
		['Designations', 'Designations', 'Regional Manager'],
		['Locations', 'Locations', 'Scranton'],
	] as const) {
		await page.getByRole('listitem', { name: new RegExp(`^${area} `) }).click()
		await expect(page.getByRole('grid', { name: grid })).toBeVisible()
		await expect(page.getByRole('row').filter({ hasText: row }).first()).toBeVisible()
	}
	await page.getByRole('listitem', { name: /^Organisation / }).click()
	const profile = page.locator('ef-hcm-organisation-profile')
	await expect(profile.getByText('America/New_York')).toBeVisible()
	await expect(
		profile.getByText('The organisation name is managed in the Account portal.'),
	).toBeVisible()
})

test('keeps structure reads and writes authorized by the API, not navigation', /** REQ-007: HR Operations can read through the API but has no discovery grant or write permission. */ async ({
	page,
}) => {
	await persona(page, 'Toby Flenderson')
	await page.goto('/workforce-foundation/organization-structure?area=designations')
	await expect(page).toHaveURL(/access-denied/)
	const headers = {
		host: 'acme.localhost',
		'x-hcm-development-persona': 'toby',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
	}
	const base = 'http://127.0.0.1:4402/api/v1/workforce-foundation/structure'
	expect((await page.request.get(`${base}/designations`, { headers })).status()).toBe(200)
	expect((await page.request.get(`${base}/options/countries`, { headers })).status()).toBe(403)
	const denied = await page.request.post(`${base}/designations`, {
		headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
		data: {
			code: 'DENIED_TITLE',
			name: 'Denied',
			description: '',
			parentId: null,
			sortOrder: 1,
			reason: 'Read-only persona must be refused',
		},
	})
	expect(denied.status()).toBe(403)
})

test('maintains focused-dialog areas with guarded drafts, retirement and reactivation', /** REQ-006, REQ-008, REQ-009: dialogs keep drafts, commands persist and refresh from the server. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await persona(page, 'David Wallace')
	await openArea(page, 'Designations')
	const stamp = Date.now()
	const code = `E2E_TITLE_${stamp}`
	const name = `Browser designation ${stamp}`
	await action(page, 'Create designation', 'ef-hcm-structure-area')
	const dialog = page.locator('ef-hcm-structure-item-dialog')
	await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill(code)
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name)
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(
		dialog.getByRole('textbox', { name: 'Reason for change', exact: true }),
	).toBeFocused()
	await dialog
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance designation')
	expect(await violations(page)).toEqual([])
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(`${name} saved.`)).toBeVisible()
	const detail = page.locator('ef-hcm-structure-detail')
	await expect(detail.getByRole('heading', { name }).first()).toBeVisible()
	await action(page, 'Edit', 'ef-hcm-structure-detail')
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`${name} edited`)
	await dialog
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance rename')
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(detail.getByRole('heading', { name: `${name} edited` }).first()).toBeVisible()
	await action(page, 'Retire', 'ef-hcm-structure-detail')
	const status = page.locator('ef-hcm-structure-status-dialog')
	await status
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance retirement')
	await status.getByRole('button', { name: 'Retire', exact: true }).click()
	await expect(status).toHaveCount(0)
	await expect(detail.getByText('Inactive').first()).toBeVisible()
	await action(page, 'Reactivate', 'ef-hcm-structure-detail')
	await status
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance reactivation')
	await status.getByRole('button', { name: 'Reactivate', exact: true }).click()
	await expect(detail.getByText('Active').first()).toBeVisible()
})

test('creates a unit on its dedicated route, adds a dated version and retires it', /** REQ-005 and REQ-009: effective-dated placement keeps history and closes the prior version. */ async ({
	page,
}) => {
	test.setTimeout(240000)
	await persona(page, 'David Wallace')
	await openArea(page, 'Units')
	const stamp = Date.now()
	const name = `Browser branch ${stamp}`
	await action(page, 'Create unit', 'ef-hcm-structure-area')
	await expect(page).toHaveURL(/organization-structure\/units\/new$/)
	const form = 'ef-hcm-structure-edit-page'
	await page.locator(form).getByRole('textbox', { name: 'Code', exact: true }).fill(`E2E-${stamp}`)
	await page.locator(form).getByRole('textbox', { name: 'Name', exact: true }).fill(name)
	const from = page.locator(form).getByRole('textbox', { name: 'Effective from', exact: true })
	await from.fill('Jan 1, 2026')
	await from.press('Tab')
	await pick(page, form, 'Unit type', 'Branch')
	await pick(page, form, 'Parent unit', 'Dunder Mifflin')
	await page.getByRole('button', { name: 'empFLOWyee home', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(page).toHaveURL(/units\/new$/)
	await page
		.locator(form)
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance unit')
	expect(
		(await new AxeBuilder({ page }).include(form).analyze()).violations
			.map(/** Rule identity. */ (item) => item.id)
			.filter(/** App-attributable only. */ (id) => !SHARED_FINDINGS.includes(id)),
	).toEqual([])
	await page.locator(form).getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page).toHaveURL(/area=units&item=/)
	const detail = page.locator('ef-hcm-structure-detail')
	await expect(detail.getByRole('heading', { name }).first()).toBeVisible()
	await action(page, 'Add version', 'ef-hcm-structure-detail')
	await expect(page).toHaveURL(/units\/.+\/edit$/)
	await page
		.locator(form)
		.getByRole('textbox', { name: 'Name', exact: true })
		.fill(`${name} renamed`)
	const version = page.locator(form).getByRole('textbox', { name: 'Effective from', exact: true })
	await version.fill('Jan 1, 2025')
	await version.press('Tab')
	await page
		.locator(form)
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance rename from a date')
	await page.locator(form).getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.locator(form).getByText(/must start after the current version/)).toBeVisible()
	await version.fill('Mar 1, 2026')
	await version.press('Tab')
	await page.locator(form).getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page).toHaveURL(/area=units&item=/)
	await detail.getByRole('tab', { name: 'Versions', exact: true }).click()
	await expect(detail.getByText(name, { exact: true })).toBeVisible()
	await expect(detail.getByText(`${name} renamed`, { exact: true }).first()).toBeVisible()
	await action(page, 'Retire unit', 'ef-hcm-structure-detail')
	const status = page.locator('ef-hcm-structure-status-dialog')
	const last = status.getByRole('textbox', { name: 'Last effective date', exact: true })
	await last.fill('Dec 31, 2026')
	await last.press('Tab')
	await status
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance retirement')
	await status.getByRole('button', { name: 'Retire unit', exact: true }).click()
	await expect(status).toHaveCount(0)
	await expect(detail.getByText('Inactive').first()).toBeVisible()
})

test('edits organisation HR defaults in a focused dialog without renaming the tenant', /** REQ-002: invalid inputs are refused and the Account-owned name has no edit control. */ async ({
	page,
}) => {
	await persona(page, 'David Wallace')
	await openArea(page, 'Organisation')
	await action(page, 'Edit defaults', 'ef-hcm-organisation-profile')
	const dialog = page.locator('ef-hcm-organisation-profile-dialog')
	await expect(dialog.getByText('Dunder Mifflin (managed in the Account portal)')).toBeVisible()
	await expect(dialog.getByRole('textbox', { name: /Organisation name/ })).toHaveCount(0)
	const zone = dialog.getByRole('combobox', { name: 'Default time zone', exact: true })
	await zone.fill('Mars/Olympus')
	await dialog
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance defaults')
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(zone).toBeFocused()
	await zone.fill('America/Chicago')
	await zone.press('Enter')
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(
		page.locator('ef-hcm-organisation-profile').getByText('America/Chicago'),
	).toBeVisible()
	await action(page, 'Edit defaults', 'ef-hcm-organisation-profile')
	await zone.fill('America/New_York')
	await zone.press('Enter')
	await dialog
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Restore acceptance defaults')
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(
		page.locator('ef-hcm-organisation-profile').getByText('America/New_York'),
	).toBeVisible()
})
