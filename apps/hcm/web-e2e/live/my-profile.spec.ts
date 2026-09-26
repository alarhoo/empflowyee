import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/** Shared findings recorded outside this app: Display Form definition lists and ObjectStatus contrast. */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']

/** Run axe on the feature and return violations other than the recorded shared findings. */
async function violations(page: Page): Promise<string[]> {
	const result = await new AxeBuilder({ page }).include('ef-hcm-my-profile').analyze()
	return result.violations
		.filter(/** Keep app-attributable findings. */ (item) => !SHARED_FINDINGS.includes(item.id))
		.flatMap(
			/** Report each node by rule and target. */ (item) =>
				item.nodes.map(
					/** Identify the finding. */ (node) => `${item.id} ${JSON.stringify(node.target)}`,
				),
		)
}

/** Open My Profile as Jim from catalogue search. */
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('MY_PROFILE')
	await page
		.getByRole('button', { name: /^My Profile/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/my-profile$/)
	await expect(profile(page).getByRole('tab', { name: 'Overview' })).toBeVisible()
}

/** The feature host. */
function profile(page: Page) {
	return page.locator('ef-hcm-my-profile')
}

/** Select an Object Page section tab. */
async function section(page: Page, name: string): Promise<void> {
	await profile(page).getByRole('tab', { name, exact: true }).click()
}

test('reads the own profile with edit modes and read-only employment', /** REQ-001, REQ-003, REQ-005. */ async ({
	page,
}) => {
	await open(page)
	await expect(profile(page)).toContainText('Sales Representative')
	await expect(profile(page)).toContainText('Michael Scott')
	await section(page, 'Personal')
	await expect(profile(page)).toContainText('Legal first name')
	await expect(profile(page)).toContainText('Change through HR')
	await expect(profile(page).getByRole('button', { name: /correction/i })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
	await section(page, 'Employment')
	await expect(profile(page)).toContainText('Primary employment')
	await expect(profile(page)).toContainText('Confirmed')
	await expect(profile(page)).toContainText('30 days')
	await expect(profile(page).getByRole('button', { name: 'Edit' })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
})

test('edits the preferred name and keeps dirty drafts on cancel', /** REQ-002, REQ-007. */ async ({
	page,
}) => {
	await open(page)
	await section(page, 'Personal')
	await profile(page).getByRole('button', { name: 'Edit personal details' }).click()
	const dialog = page.locator('ef-hcm-my-profile-personal-dialog')
	await dialog.getByRole('textbox', { name: 'Preferred name' }).fill('Big Tuna')
	await dialog.getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing' }).click()
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByRole('heading', { name: 'Big Tuna Halpert', level: 1 })).toBeVisible()
	await profile(page).getByRole('button', { name: 'Edit personal details' }).click()
	await dialog.getByRole('textbox', { name: 'Preferred name' }).fill('')
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByRole('heading', { name: 'Jim Halpert', level: 1 })).toBeVisible()
})

test('adds an unverified personal email and removes it', /** REQ-002. */ async ({ page }) => {
	await open(page)
	await section(page, 'Contact')
	await profile(page).getByRole('button', { name: 'Add contact' }).click()
	const dialog = page.locator('ef-hcm-my-profile-contact-dialog')
	await dialog.getByRole('textbox', { name: 'Email' }).fill('not-an-email')
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog).toContainText('Enter an email address')
	await dialog.getByRole('textbox', { name: 'Email' }).fill('bigtuna@example.com')
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog).toHaveCount(0)
	const table = profile(page).locator('ui5-table[accessible-name="Personal contacts"]')
	await expect(table.getByRole('link', { name: 'bigtuna@example.com' })).toHaveAttribute(
		'href',
		'mailto:bigtuna@example.com',
	)
	await expect(table).toContainText('Not verified')
	expect(await violations(page)).toEqual([])
	await table.locator('ui5-table-row-action[text="Remove"]').first().click()
	await page
		.locator('ef-hcm-my-profile-remove-dialog')
		.getByRole('button', { name: 'Remove' })
		.click()
	await expect(table).toContainText('No personal contacts are recorded.')
})

test('maintains an emergency contact with a call link', /** REQ-002. */ async ({ page }) => {
	await open(page)
	await section(page, 'Emergency contacts and family')
	await profile(page).getByRole('button', { name: 'Add person' }).click()
	const dialog = page.locator('ef-hcm-my-profile-relationship-dialog')
	await dialog.getByRole('textbox', { name: 'Full name' }).fill('Pam Halpert')
	await dialog.getByRole('textbox', { name: 'Contact number' }).fill('+1 570 555 0100')
	await dialog.getByRole('checkbox', { name: 'Emergency contact' }).click()
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog).toHaveCount(0)
	const table = profile(page).locator('ui5-table[accessible-name="Emergency contacts and family"]')
	await expect(table.locator('ui5-table-row[row-key]')).toHaveCount(1)
	await expect(table).toContainText('Pam Halpert')
	await expect(table.getByRole('link', { name: '+1 570 555 0100' })).toHaveAttribute(
		'href',
		'tel:+1 570 555 0100',
	)
	await table.locator('ui5-table-row-action[text="Remove"]').first().click()
	await page
		.locator('ef-hcm-my-profile-remove-dialog')
		.getByRole('button', { name: 'Remove' })
		.click()
	await expect(table).toContainText('No emergency contacts or family members are recorded.')
})

test('narrows the preferred name visibility and returns to the company setting', /** REQ-004. */ async ({
	page,
}) => {
	await open(page)
	await section(page, 'Privacy')
	const table = profile(page).locator('ui5-table[accessible-name="Visibility preferences"]')
	await expect(table).toContainText('Preferred name')
	await expect(table).toContainText('Company setting')
	await table.locator('ui5-table-row-action[text="Change"]').first().click()
	const dialog = page.locator('ef-hcm-my-profile-visibility-dialog')
	await dialog.getByRole('combobox', { name: 'Visible to' }).click()
	await page.getByRole('option', { name: 'Me and HR' }).click()
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(table).toContainText('Narrowed by you')
	await table.locator('ui5-table-row-action[text="Change"]').first().click()
	await dialog.getByRole('combobox', { name: 'Visible to' }).click()
	await page.getByRole('option', { name: 'Company setting' }).click()
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(table).toContainText('Company setting')
})

test('stays usable at supported widths', /** REQ-007. */ async ({ page }) => {
	await open(page)
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(profile(page).getByRole('tab', { name: 'Overview' })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow. */ () => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
	}
})
