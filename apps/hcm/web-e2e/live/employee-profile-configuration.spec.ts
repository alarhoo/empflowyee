import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/**
 * Shared findings recorded outside this app: UI5 Display Form definition-list semantics and
 * inverted positive ObjectStatus contrast. Every other rule must pass.
 */
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
async function violations(
	page: Page,
	host = 'ef-hcm-employee-profile-configuration',
): Promise<string[]> {
	const result = await new AxeBuilder({ page }).include(host).analyze()
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
async function open(page: Page, name = 'Toby Flenderson'): Promise<void> {
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
	await openApplicationSearch(page)
	await page
		.getByRole('textbox', { name: 'Search applications' })
		.fill('EMPLOYEE_PROFILE_CONFIGURATION')
	await page
		.getByRole('button', { name: /^Employee Profile Configuration/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/employee-profile-configuration$/)
	await expect(page.getByRole('grid', { name: 'Standard fields' })).toBeVisible()
}

/** Open a field row by its label and code. */
async function openField(page: Page, text: string): Promise<void> {
	await page.getByRole('row').filter({ hasText: text }).first().click()
	await expect(page.locator('ef-hcm-profile-field-detail')).toContainText('Effective visibility')
}

/** Select an object-page section tab. */
async function section(page: Page, name: string): Promise<void> {
	await page.locator('ef-hcm-profile-field-detail').getByRole('tab', { name }).click()
}

/** Click an object-page action, opening the native overflow first on narrow layouts. */
async function action(page: Page, name: string): Promise<void> {
	const host = page.locator('ef-hcm-profile-field-detail')
	const button = host.getByRole('button', { name, exact: true })
	await expect(
		/** Converge on a visible action, reopening the overflow if needed. */ async () => {
			if (!(await button.isVisible())) {
				await page.keyboard.press('Escape')
				await host.getByRole('button', { name: 'Additional Options', exact: true }).first().click()
			}
			await expect(button).toBeVisible({ timeout: 2000 })
		},
	).toPass({ timeout: 15000 })
	await button.click()
}

test('lists the product catalogue and previews effective visibility', /** REQ-001 and REQ-005. */ async ({
	page,
}) => {
	await open(page)
	await expect(page.getByRole('grid', { name: 'Standard fields' })).toBeVisible()
	const list = page.locator('ef-hcm-employee-profile-configuration ui5-table')
	await expect(list.getByRole('row').filter({ hasText: 'Birth date (birth-date)' })).toContainText(
		'Employee and HR',
	)
	await expect(list.getByRole('row').filter({ hasText: 'Work mode (work-mode)' })).toContainText(
		'(narrowed)',
	)
	await page.getByRole('searchbox', { name: 'Search code or name' }).fill('legal')
	await expect(list.getByRole('row')).toHaveCount(5)
	await page.getByRole('searchbox', { name: 'Search code or name' }).fill('')
	await openField(page, 'Work mode (work-mode)')
	await expect(page).toHaveURL(/standard%3Awork-mode|standard:work-mode/)
	await section(page, 'Effective visibility')
	const preview = page.locator('ef-hcm-profile-field-detail')
	await expect(
		preview.getByRole('checkbox', { name: 'Everyone in the organisation sees the field' }),
	).not.toBeChecked()
	await expect(preview.getByRole('checkbox', { name: 'Manager sees the field' })).toBeChecked()
	expect(await violations(page)).toEqual([])
})

test('narrows a field, refuses widening options and resets to the product default', /** REQ-002. */ async ({
	page,
}) => {
	await open(page)
	await openField(page, 'Preferred name (preferred-name)')
	await action(page, 'Narrow policy')
	const dialog = page.locator('ef-hcm-profile-policy-dialog')
	await expect(page.getByRole('dialog', { name: 'Narrow policy for Preferred name' })).toBeVisible()
	await dialog.getByRole('combobox', { name: 'Visible to' }).click()
	await page.getByRole('option', { name: 'Employee, HR and manager' }).click()
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Browser acceptance')
	expect(await violations(page, 'ef-hcm-profile-policy-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText('Preferred name saved.')).toBeVisible()
	await section(page, 'Effective visibility')
	await section(page, 'Effective visibility')
	const preview = page.locator('ef-hcm-profile-field-detail')
	await expect(
		preview.getByRole('checkbox', { name: 'Everyone in the organisation sees the field' }),
	).not.toBeChecked()
	await openField(page, 'Birth date (birth-date)')
	await action(page, 'Narrow policy')
	await dialog.getByRole('combobox', { name: 'Visible to' }).click()
	await expect(page.getByRole('option', { name: 'Whole organisation' })).toHaveCount(0)
	await page.keyboard.press('Escape')
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await openField(page, 'Preferred name (preferred-name)')
	await action(page, 'Reset to product default')
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Restore baseline')
	await dialog.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await section(page, 'Effective visibility')
	await expect(
		preview.getByRole('checkbox', { name: 'Everyone in the organisation sees the field' }),
	).toBeChecked()
})

test('creates a select custom field on its own route, maintains options and retires it', /** REQ-003 and REQ-004. */ async ({
	page,
}) => {
	const code = `E2E_${Date.now().toString(36).toUpperCase()}`
	await open(page)
	await page.getByRole('button', { name: 'New custom field', exact: true }).click()
	await expect(page).toHaveURL(/custom-fields\/new$/)
	const form = page.locator('ef-hcm-custom-field-page')
	await form.getByRole('textbox', { name: 'Code' }).fill(code)
	await form.getByRole('textbox', { name: 'Name' }).fill('Laptop preference')
	await form.getByRole('combobox', { name: 'Data type' }).click()
	await page.getByRole('option', { name: 'Single choice' }).click()
	await form
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Equipment planning')
	await form.getByRole('button', { name: 'Create field', exact: true }).click()
	await expect(form.getByText('Add at least one option.')).toBeVisible()
	await form.getByRole('button', { name: 'Add option', exact: true }).click()
	await form.getByRole('textbox', { name: 'Option 1 code' }).fill('MAC')
	await form.getByRole('textbox', { name: 'Option 1 name' }).fill('Mac')
	expect(await violations(page, 'ef-hcm-custom-field-page')).toEqual([])
	await form.getByRole('button', { name: 'Create field', exact: true }).click()
	await expect(page).toHaveURL(/custom%3A|custom:/)
	const detail = page.locator('ef-hcm-profile-field-detail')
	await expect(detail).toContainText('Laptop preference')
	await section(page, 'Options')
	await expect(page.locator('ef-hcm-profile-field-detail')).toContainText('Mac (MAC)')
	await action(page, 'Add option')
	const option = page.locator('ef-hcm-custom-field-option-dialog')
	await option.getByRole('textbox', { name: 'Code' }).fill('WINDOWS')
	await option.getByRole('textbox', { name: 'Name' }).fill('Windows')
	await option.getByRole('textbox', { name: 'Reason for change' }).fill('Second platform')
	await option.getByRole('button', { name: 'Add option', exact: true }).click()
	await expect(option).toHaveCount(0)
	await section(page, 'Options')
	await expect(page.locator('ef-hcm-profile-field-detail')).toContainText('Windows (WINDOWS)')
	await page.getByRole('button', { name: 'Retire option Mac' }).click()
	await option.getByRole('textbox', { name: 'Reason for change' }).fill('No longer issued')
	await option.getByRole('button', { name: 'Retire', exact: true }).click()
	await expect(option).toHaveCount(0)
	await section(page, 'Options')
	await expect(
		page.locator('ef-hcm-profile-field-detail').getByRole('row').filter({ hasText: 'Mac (MAC)' }),
	).toContainText('Retired')
	await action(page, 'Retire field')
	const field = page.locator('ef-hcm-custom-field-dialog')
	await field.getByRole('textbox', { name: 'Reason for change' }).fill('Programme ended')
	await field.getByRole('button', { name: 'Retire', exact: true }).click()
	await expect(field).toHaveCount(0)
	await expect(detail).toContainText('This field is retired.')
	await expect(detail.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
})

test('keeps a dirty new custom field until the discard is confirmed', /** REQ-007. */ async ({
	page,
}) => {
	await open(page)
	await page.getByRole('button', { name: 'New custom field', exact: true }).click()
	const form = page.locator('ef-hcm-custom-field-page')
	await form.getByRole('textbox', { name: 'Name' }).fill('Draft only')
	await form.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing' }).click()
	await expect(form.getByRole('textbox', { name: 'Name' })).toHaveValue('Draft only')
	await form.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes' }).click()
	await expect(page).toHaveURL(/employee-profile-configuration$/)
})

test('lets administrators read without mutation controls while the API refuses writes', /** REQ-006 and DEC-HCM2-019. */ async ({
	page,
	request,
}) => {
	await open(page, 'David Wallace')
	await expect(page.getByText('Read-only view. Changes are not available.').first()).toBeVisible()
	await expect(page.getByRole('button', { name: 'New custom field' })).toHaveCount(0)
	await openField(page, 'Work mode (work-mode)')
	const detail = page.locator('ef-hcm-profile-field-detail')
	for (const name of [/^Narrow policy/, /^Reset/, /^Edit field/])
		await expect(detail.getByRole('button', { name })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
	const write = await request.put(
		'http://127.0.0.1:4402/api/v1/employee/profile-fields/standard%3Awork-mode/tenant-policy/WorkforceActivation',
		{
			headers: {
				host: 'acme.localhost',
				origin: 'http://acme.localhost:4302',
				'sec-fetch-site': 'same-origin',
				'content-type': 'application/json',
				'idempotency-key': crypto.randomUUID(),
				'x-hcm-development-persona': 'david',
			},
			data: {
				requiredness: 'Optional',
				visibility: 'Hr',
				selfEditMode: 'NotEditable',
				allowWorkerPreference: false,
				expectedRevision: 1,
				reason: 'Not allowed',
			},
		},
	)
	expect(write.status()).toBe(403)
})

test('stays usable at supported widths and recovers a failed load', /** REQ-007. */ async ({
	page,
}) => {
	await open(page)
	await openField(page, 'Work email (work-email)')
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(page.locator('ef-hcm-profile-field-detail')).toContainText('Work email')
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native table popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.route(
		'**/api/v1/employee/profile-fields/**',
		/** Fail detail reads. */ (route) => route.abort(),
	)
	await openField(page, 'Hire date (hire-date)').catch(
		/** The detail fails on purpose. */ () => undefined,
	)
	const detail = page.locator('ef-hcm-profile-field-detail')
	await expect(detail.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
	await page.unroute('**/api/v1/employee/profile-fields/**')
	await detail.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(detail).toContainText('Effective visibility')
})
