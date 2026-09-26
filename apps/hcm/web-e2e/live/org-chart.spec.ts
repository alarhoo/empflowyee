import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/** Shared findings recorded outside this app: Display Form definition lists and ObjectStatus contrast. */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']

/** The native FCL separator arrow has no public label API and sits inside the separator. */
function nativeFclFinding(target: unknown): boolean {
	const path = JSON.stringify(target)
	return (
		path.startsWith('[["ui5-flexible-column-layout",".ui5-fcl-arrow"') ||
		path === '[["ui5-flexible-column-layout",".ui5-fcl-separator-start"]]'
	)
}

/** Run axe on the feature and return violations other than the recorded shared findings. */
async function violations(page: Page): Promise<string[]> {
	const result = await new AxeBuilder({ page }).include('ef-hcm-org-chart').analyze()
	return result.violations
		.filter(/** Keep app-attributable findings. */ (item) => !SHARED_FINDINGS.includes(item.id))
		.flatMap(
			/** Report each remaining node by rule and target. */ (item) =>
				item.nodes
					.filter(/** Drop native FCL internals only. */ (node) => !nativeFclFinding(node.target))
					.map(/** Identify the finding. */ (node) => `${item.id} ${JSON.stringify(node.target)}`),
		)
}

/** Switch persona through the real Settings dialog and open the app from catalogue search. */
async function open(page: Page, name = 'Jim Halpert'): Promise<void> {
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
	if (name !== 'Jim Halpert') {
		await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
		await page.getByRole('menuitem', { name: /^Settings/ }).click()
		await page.getByRole('combobox', { name: 'Development persona' }).click()
		await page.getByRole('option', { name, exact: false }).click()
	}
	await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('ORG_CHART')
	await page
		.getByRole('button', { name: /^Org Chart/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/workforce-foundation\/org-chart$/)
	await expect(page.getByRole('treeitem', { name: /^David Wallace/ })).toBeVisible()
}

test('explores the reporting tree and opens a person with organisation-visible details', /** REQ-001 and REQ-003. */ async ({
	page,
}) => {
	await open(page)
	const tree = page.getByRole('tree', { name: 'Reporting structure' })
	await expect(tree).toBeVisible()
	const david = page.getByRole('treeitem', { name: /^David Wallace/ })
	// Keyboard expansion: the native tree toggles a focused item with ArrowRight.
	await david.focus()
	await page.keyboard.press('ArrowRight')
	await expect(page.getByRole('treeitem', { name: /^Michael Scott/ })).toBeVisible()
	await page.getByRole('treeitem', { name: /^Michael Scott/ }).click()
	await expect(page).toHaveURL(
		/org-chart\/dunder-mifflin%2Fassignment%2Fmichael|org-chart\/dunder-mifflin/,
	)
	const person = page.locator('ef-hcm-org-chart-person')
	await expect(person).toContainText('Regional Manager')
	await expect(
		person.getByRole('link', { name: 'michael.scott@dundermifflin.example' }),
	).toHaveAttribute('href', 'mailto:michael.scott@dundermifflin.example')
	await expect(person).not.toContainText('Birth date')
	await person.getByRole('tab', { name: 'Direct reports' }).click()
	await expect(person.getByRole('row').filter({ hasText: 'Jim Halpert' })).toBeVisible()
	await person.getByRole('row').filter({ hasText: 'Jim Halpert' }).click()
	await expect(person).toContainText('Sales Representative')
	await person.getByRole('link', { name: 'Open manager Michael Scott' }).click()
	await expect(person).toContainText('Regional Manager')
	expect(await violations(page)).toEqual([])
})

test('finds a person and reveals their path', /** REQ-002. */ async ({ page }) => {
	await open(page)
	const search = page.getByRole('searchbox', { name: 'Search name or worker number' })
	await search.fill('p')
	await search.press('Enter')
	await expect(page.getByText('Enter at least two characters.')).toBeVisible()
	await search.fill('beesly')
	await search.press('Enter')
	await page.getByRole('listitem', { name: /^Pam Beesly/ }).click()
	await expect(page.locator('ef-hcm-org-chart-person')).toContainText('Receptionist')
	await expect(page.getByRole('treeitem', { name: /^Pam Beesly/ })).toBeVisible()
	await expect(page.getByRole('treeitem', { name: /^Michael Scott/ })).toBeVisible()
	// Jim is the default persona, so a reload keeps him and proves the deep link.
	await page.reload()
	await expect(page.locator('ef-hcm-org-chart-person')).toContainText('Receptionist')
	await expect(page.getByRole('treeitem', { name: /^Pam Beesly/ })).toBeVisible()
})

test('stays usable at supported widths and reports failures truthfully', /** REQ-006. */ async ({
	page,
}) => {
	await open(page, 'Toby Flenderson')
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(page.getByRole('treeitem', { name: /^David Wallace/ })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.route(
		'**/api/v1/workforce-foundation/org-chart/nodes/**',
		/** Fail node reads. */ (route) => route.abort(),
	)
	await page.getByRole('treeitem', { name: /^Angela Martin/ }).click()
	const person = page.locator('ef-hcm-org-chart-person')
	await expect(person.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
	await page.unroute('**/api/v1/workforce-foundation/org-chart/nodes/**')
	await person.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(person).toContainText('Senior Accountant')
})
