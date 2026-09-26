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
	const result = await new AxeBuilder({ page }).include('ef-hcm-team-directory').analyze()
	return result.violations
		.filter(/** Keep app-attributable findings. */ (item) => !SHARED_FINDINGS.includes(item.id))
		.flatMap(
			/** Report each remaining node by rule and target. */ (item) =>
				item.nodes
					.filter(/** Drop native FCL internals only. */ (node) => !nativeFclFinding(node.target))
					.map(/** Identify the finding. */ (node) => `${item.id} ${JSON.stringify(node.target)}`),
		)
}

/** Switch to Michael through the real Settings dialog and open the app from catalogue search. */
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
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Michael Scott', exact: false }).click()
	await expect(page.getByRole('button', { name: 'Michael Scott', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('TEAM_DIRECTORY')
	await page
		.getByRole('button', { name: /^Team Directory/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/team-directory$/)
	await expect(page.getByRole('grid', { name: 'Team members' })).toBeVisible()
}

/** Rows of the team table. */
function rows(page: Page) {
	return page.locator(
		'ef-hcm-team-directory ui5-table[accessible-name="Team members"] ui5-table-row',
	)
}

test('lists the direct reports with employment and probation status', /** REQ-001 and REQ-002. */ async ({
	page,
}) => {
	await open(page)
	await expect(rows(page)).toHaveCount(3)
	await expect(rows(page).nth(0)).toContainText('Dwight Schrute')
	await expect(rows(page).filter({ hasText: 'Jim Halpert' })).toContainText('Confirmed')
	await expect(rows(page).filter({ hasText: 'Jim Halpert' })).toContainText('Active')
	await page.getByRole('combobox', { name: 'Probation' }).click()
	await page.getByRole('option', { name: 'In probation' }).click()
	await page.getByRole('button', { name: 'Apply filters' }).click()
	await expect(page.getByText('No team members match these filters')).toBeVisible()
	expect(await violations(page)).toEqual([])
})

test('opens a member with manager-visible facts and no personal data', /** REQ-002. */ async ({
	page,
}) => {
	await open(page)
	await rows(page).filter({ hasText: 'Jim Halpert' }).click()
	await expect(page).toHaveURL(/team-directory\/dunder-mifflin%2Fworker%2Fjim$/)
	const member = page.locator('ef-hcm-team-member')
	await expect(member).toContainText('Sales Representative')
	await member.getByRole('tab', { name: 'Employment' }).click()
	await expect(member).toContainText('Permanent')
	await expect(member).toContainText('30 days')
	await member.getByRole('tab', { name: 'Probation' }).click()
	await expect(member).toContainText('Confirmed')
	for (const text of ['Birth date', 'Personal email', 'Address', 'Blood group'])
		await expect(member).not.toContainText(text)
	expect(await violations(page)).toEqual([])
})

test('stays usable at supported widths', /** REQ-004. */ async ({ page }) => {
	await open(page)
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(page.getByRole('grid', { name: 'Team members' })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})
