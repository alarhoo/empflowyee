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
	const result = await new AxeBuilder({ page }).include('ef-hcm-employee-directory').analyze()
	return result.violations
		.filter(/** Keep app-attributable findings. */ (item) => !SHARED_FINDINGS.includes(item.id))
		.flatMap(
			/** Report each remaining node by rule and target. */ (item) =>
				item.nodes
					.filter(/** Drop native FCL internals only. */ (node) => !nativeFclFinding(node.target))
					.map(/** Identify the finding. */ (node) => `${item.id} ${JSON.stringify(node.target)}`),
		)
}

/** Open the directory as Jim, the default persona, from catalogue search. */
async function open(page: Page): Promise<void> {
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
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('EMPLOYEE_DIRECTORY')
	await page
		.getByRole('button', { name: /^Employee Directory/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/employee-directory$/)
	await expect(page.getByRole('grid', { name: 'Colleagues' })).toBeVisible()
}

/** Rows of the colleague table. */
function rows(page: Page) {
	return page.locator(
		'ef-hcm-employee-directory ui5-table[accessible-name="Colleagues"] ui5-table-row',
	)
}

test('searches colleagues by name, email and worker number and filters by department', /** REQ-001 and REQ-002. */ async ({
	page,
}) => {
	await open(page)
	await expect(rows(page)).toHaveCount(8)
	const search = page.getByRole('searchbox', { name: 'Search name, work email or worker number' })
	await search.fill('schrute')
	await search.press('Enter')
	await expect(rows(page)).toHaveCount(1)
	await expect(rows(page).first()).toContainText('dwight.schrute@dundermifflin.example')
	await search.fill('pam.b')
	await search.press('Enter')
	await expect(rows(page)).toHaveCount(1)
	await search.fill('DM-OS')
	await search.press('Enter')
	await expect(rows(page).first()).toContainText('Oscar Martinez')
	await search.fill('')
	const department = page.getByRole('combobox', { name: 'Department' })
	await department.fill('Accounting')
	await page.getByRole('option', { name: 'Accounting' }).click()
	await page.getByRole('button', { name: 'Apply filters' }).click()
	await expect(rows(page)).toHaveCount(2)
	await expect(rows(page).first()).toContainText('Angela Martin')
	expect(await violations(page)).toEqual([])
})

test('opens a colleague with reporting context and follows the manager link', /** REQ-003. */ async ({
	page,
}) => {
	await open(page)
	await rows(page).filter({ hasText: 'Jim Halpert' }).click()
	await expect(page).toHaveURL(/employee-directory\/dunder-mifflin%2Fworker%2Fjim$/)
	const person = page.locator('ef-hcm-directory-person')
	await expect(person).toContainText('DM-JIM')
	await expect(
		person.getByRole('link', { name: 'jim.halpert@dundermifflin.example' }),
	).toHaveAttribute('href', 'mailto:jim.halpert@dundermifflin.example')
	await expect(person).not.toContainText('Hire date')
	await person.getByRole('tab', { name: 'Reporting' }).click()
	await person.getByRole('link', { name: 'Open manager Michael Scott' }).click()
	await expect(page).toHaveURL(/dunder-mifflin%2Fworker%2Fmichael$/)
	await person.getByRole('tab', { name: 'Reporting' }).click()
	await expect(person.getByRole('row').filter({ hasText: 'Pam Beesly' })).toBeVisible()
	expect(await violations(page)).toEqual([])
	// Jim is the default persona, so a reload keeps him and proves the deep link.
	await page.reload()
	await expect(page.locator('ef-hcm-directory-person')).toContainText('Regional Manager')
})

test('sorts through native view settings and stays usable at supported widths', /** REQ-006. */ async ({
	page,
}) => {
	await open(page)
	await page.getByRole('button', { name: 'Colleague view settings' }).click()
	await expect(page.getByRole('dialog', { name: 'View Settings' })).toBeVisible()
	// Native rows in order: Ascending, Descending, then the declared field (Name).
	await page.getByRole('radio', { name: 'Item Selection.' }).nth(1).click()
	await page.getByRole('button', { name: 'OK', exact: true }).click()
	await expect(rows(page).first()).toContainText('Toby Flenderson')
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(page.getByRole('grid', { name: 'Colleagues' })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})

test('reports a failed load truthfully and recovers with Retry', /** REQ-006. */ async ({
	page,
}) => {
	await page.route(
		'**/api/v1/employee/directory?**',
		/** Fail the list read. */ (route) => route.abort(),
	)
	await page.goto('/')
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('EMPLOYEE_DIRECTORY')
	await page
		.getByRole('button', { name: /^Employee Directory/ })
		.first()
		.click()
	const view = page.locator('ef-hcm-employee-directory')
	await expect(view.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
	await page.unroute('**/api/v1/employee/directory?**')
	await view.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(rows(page)).toHaveCount(8)
})
