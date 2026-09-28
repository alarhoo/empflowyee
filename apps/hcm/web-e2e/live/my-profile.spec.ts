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
	await expect(profile(page).getByRole('tab', { name: 'Personal', exact: true })).toBeVisible()
}

/** The feature host. */
function profile(page: Page) {
	return page.locator('ef-hcm-my-profile')
}

/** Select an Object Page section tab. */
async function section(page: Page, name: string): Promise<void> {
	await profile(page).getByRole('tab', { name, exact: true }).click()
}

test('opens Personal with grouped details and keeps edit actions out of the read view', /** REQ-001, REQ-003, REQ-005. */ async ({
	page,
}) => {
	await open(page)
	await expect(profile(page)).toContainText('Sales Representative')
	await expect(profile(page)).toContainText('Michael Scott')
	await section(page, 'Personal')
	await expect(profile(page)).toContainText('Legal first name')
	await expect(
		profile(page).getByRole('link', { name: 'Request correction of Legal first name' }),
	).toBeVisible()
	await expect(
		profile(page).getByRole('heading', { name: 'Basic details', exact: true }),
	).toBeVisible()
	await expect(profile(page).getByRole('heading', { name: 'Office', exact: true })).toBeVisible()
	await expect(profile(page)).not.toContainText('Change through HR')
	await expect(profile(page).getByRole('button', { name: 'Edit personal details' })).toHaveCount(0)
	await expect(profile(page).getByRole('button', { name: 'Add contact' })).toHaveCount(0)
	await expect(profile(page).getByRole('tab', { name: 'Contact', exact: true })).toHaveCount(0)
	await expect(profile(page).locator('ui5-form[accessible-name="Primary employment"]')).toHaveCount(
		0,
	)
	await expect(profile(page).getByRole('button', { name: /correction/i })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
	await section(page, 'Employment')
	await expect(profile(page)).toContainText('Primary employment')
	await expect(profile(page)).toContainText('Confirmed')
	await expect(profile(page)).toContainText('30 days')
	await expect(
		profile(page).getByRole('button', { name: 'Edit profile', exact: true }),
	).toHaveCount(0)
	await expect(
		profile(page).getByRole('heading', { name: 'Basic details', exact: true }),
	).toHaveCount(0)
	expect(await violations(page)).toEqual([])
	await section(page, 'Personal')
	await profile(page).getByRole('link', { name: 'Request correction of Legal first name' }).click()
	await expect(page).toHaveURL(/\/employee\/my-hr-requests\?new=personal-data-correction&field=/)
	const correction = page.locator('ef-hcm-my-hr-request-dialog')
	await expect(
		correction.getByRole('combobox', { name: 'Request type', exact: true }),
	).toContainText('Personal data correction')
	await expect(correction.getByRole('textbox', { name: 'Subject' })).toHaveValue(
		'Correct my legal given name',
	)
})

test('edits the preferred name and keeps dirty drafts on cancel', /** REQ-002, REQ-007. */ async ({
	page,
}) => {
	await open(page)
	await profile(page).getByRole('button', { name: 'Edit profile', exact: true }).click()
	await expect(profile(page)).toContainText('Change through HR')
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
	await expect(profile(page)).toContainText('Your changes have been saved.')
	await section(page, 'Employment')
	await section(page, 'Personal')
	await expect(profile(page).getByRole('button', { name: 'Edit personal details' })).toHaveCount(0)
})

test('adds an unverified personal email and removes it', /** REQ-002. */ async ({ page }) => {
	const emailValue = `validation-${Date.now()}@example.com`
	const editedEmail = emailValue.replace('@', '+personal@')
	await open(page)
	await profile(page).getByRole('button', { name: 'Edit profile', exact: true }).click()
	const table = profile(page).locator('ui5-table[accessible-name="Personal contacts"]')
	const beforeCount = await table.locator('ui5-table-row[row-key]').count()
	await profile(page).getByRole('button', { name: 'Add contact' }).click()
	const dialog = page.locator('ef-hcm-my-profile-contact-dialog')
	await dialog.getByRole('textbox', { name: 'Email' }).fill('not-an-email')
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog).toContainText('Enter an email address')
	await dialog.getByRole('textbox', { name: 'Email' }).fill(emailValue)
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(table.getByRole('link', { name: emailValue })).toHaveAttribute(
		'href',
		'mailto:' + emailValue,
	)
	await expect(table).toContainText('Not verified')
	expect(await violations(page)).toEqual([])
	await profile(page).getByRole('button', { name: 'Done editing', exact: true }).click()
	await expect(profile(page).getByRole('link', { name: emailValue })).toBeVisible()
	await expect(table).toHaveCount(0)
	await profile(page).getByRole('button', { name: 'Edit profile', exact: true }).click()
	await table
		.locator('ui5-table-row')
		.filter({ hasText: emailValue })
		.getByRole('button', { name: 'Edit', exact: true })
		.click()
	await dialog.getByRole('textbox', { name: 'Email' }).fill('bad..name@example.com')
	await dialog.getByRole('textbox', { name: 'Email' }).press('Tab')
	await expect(dialog.locator('#my-profile-contact-value')).toHaveAttribute(
		'value-state',
		'Negative',
	)
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
	await dialog.getByRole('textbox', { name: 'Email' }).fill(editedEmail)
	await expect(dialog.locator('#my-profile-contact-value')).toHaveAttribute('value-state', 'None')
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(table).toContainText(editedEmail)
	await table
		.locator('ui5-table-row')
		.filter({ hasText: editedEmail })
		.getByRole('button', { name: 'Remove', exact: true })
		.click()
	await page
		.locator('ef-hcm-my-profile-remove-dialog')
		.getByRole('button', { name: 'Remove' })
		.click()
	await expect(table.locator('ui5-table-row[row-key]')).toHaveCount(beforeCount)
})

test('maintains an emergency contact with a call link', /** REQ-002. */ async ({ page }) => {
	const personName = `Validation contact ${Date.now()}`
	await open(page)
	await profile(page).getByRole('button', { name: 'Edit profile', exact: true }).click()
	const table = profile(page).locator('ui5-table[accessible-name="Emergency contacts and family"]')
	const beforeCount = await table.locator('ui5-table-row[row-key]').count()
	await profile(page).getByRole('button', { name: 'Add person' }).click()
	const dialog = page.locator('ef-hcm-my-profile-relationship-dialog')
	await dialog.getByRole('textbox', { name: 'Full name' }).fill(personName)
	const phone = dialog.getByRole('textbox', { name: 'Contact number' })
	await expect(phone).toHaveAttribute('maxlength', '40')
	await phone.fill('1    2')
	await phone.press('Tab')
	await expect(dialog.locator('#my-profile-relationship-phone')).toHaveAttribute(
		'value-state',
		'Negative',
	)
	await dialog.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
	await phone.fill('')
	await expect(dialog.locator('#my-profile-relationship-phone')).toHaveAttribute(
		'value-state',
		'None',
	)
	await dialog.getByRole('checkbox', { name: 'Emergency contact', exact: true }).click()
	await expect(dialog.locator('#my-profile-relationship-phone')).toHaveAttribute(
		'value-state',
		'Negative',
	)
	await phone.fill('+1 570 555 0100')
	await expect(dialog.locator('#my-profile-relationship-phone')).toHaveAttribute(
		'value-state',
		'None',
	)
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(table.locator('ui5-table-row[row-key]')).toHaveCount(beforeCount + 1)
	await expect(table).toContainText(personName)
	await expect(table.getByRole('link', { name: '+1 570 555 0100' })).toHaveAttribute(
		'href',
		'tel:+1 570 555 0100',
	)
	await table
		.locator('ui5-table-row')
		.filter({ hasText: personName })
		.getByRole('button', { name: 'Remove', exact: true })
		.click()
	await page
		.locator('ef-hcm-my-profile-remove-dialog')
		.getByRole('button', { name: 'Remove' })
		.click()
	await expect(table.locator('ui5-table-row[row-key]')).toHaveCount(beforeCount)
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
		await expect(profile(page).getByRole('tab', { name: 'Personal', exact: true })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow. */ () => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
	}
})

test('validates contact fields on blur, paste and type changes before sending a command', /** Shape and native bounds must work in the browser, and invalid submission must not reach the API. */ async ({
	page,
}) => {
	await open(page)
	let writes = 0
	page.on(
		'request',
		/** Count only protected contact mutations, excluding reference reads. */ (request) => {
			if (
				request.method() !== 'GET' &&
				request.url().includes('/employee/me/profile/contact-points')
			)
				writes++
		},
	)
	await profile(page).getByRole('button', { name: 'Edit profile', exact: true }).click()
	await profile(page).getByRole('button', { name: 'Add contact' }).click()
	const dialog = page.locator('ef-hcm-my-profile-contact-dialog')
	const input = dialog.locator('#my-profile-contact-value')
	const email = dialog.getByRole('textbox', { name: 'Email', exact: true })
	await expect(email).toHaveAttribute('maxlength', '254')
	for (const value of [
		' ',
		'not-an-email',
		'jim..halpert@example.com',
		'jim@-example.com',
		'jim@example..com',
	]) {
		await email.fill(value)
		await email.press('Tab')
		await expect(input).toHaveAttribute('value-state', 'Negative')
		await expect(dialog.locator('#my-profile-contact-error')).not.toBeEmpty()
		await dialog.getByRole('button', { name: 'Add', exact: true }).click()
		await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
		expect(writes).toBe(0)
	}
	await email.fill('a'.repeat(255))
	await expect(email).toHaveValue('a'.repeat(254))
	await email.fill('jim.halpert+work@example.com')
	await expect(input).toHaveAttribute('value-state', 'None')
	await expect(dialog.locator('#my-profile-contact-error')).toBeEmpty()
	await dialog.getByRole('combobox', { name: 'Type', exact: true }).click()
	await page.getByRole('option', { name: 'Mobile phone', exact: true }).click()
	const phone = dialog.getByRole('textbox', { name: 'Phone number', exact: true })
	await expect(phone).toHaveAttribute('maxlength', '40')
	await expect(phone).toHaveValue('jim.halpert+work@example.com')
	await expect(input).toHaveAttribute('value-state', 'Negative')
	for (const value of [
		'abcdef',
		'1    2',
		'12345',
		'1234567890123456',
		'++123456789',
		'+1 (570 5550100',
	]) {
		await phone.fill(value)
		await phone.press('Tab')
		await expect(input).toHaveAttribute('value-state', 'Negative')
		await dialog.getByRole('button', { name: 'Add', exact: true }).click()
		expect(writes).toBe(0)
	}
	await phone.fill('x'.repeat(41))
	await expect(phone).toHaveValue('x'.repeat(40))
	await phone.fill('+1 (570) 555-0100')
	await expect(input).toHaveAttribute('value-state', 'None')
	await expect(dialog.locator('#my-profile-contact-error')).toBeEmpty()
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	expect(writes).toBe(0)
})
