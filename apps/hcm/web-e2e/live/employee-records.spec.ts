import { randomUUID } from 'node:crypto'
import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/** Shared findings recorded outside this app: Display Form definition lists and ObjectStatus contrast. */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']

/** The native FCL separator arrows have no public label API and sit inside the separators. */
function nativeFclFinding(target: unknown): boolean {
	const path = JSON.stringify(target)
	return (
		path.startsWith('[["ui5-flexible-column-layout",".ui5-fcl-arrow"') ||
		/^\[\["ui5-flexible-column-layout","\.ui5-fcl-separator-(start|end)"\]\]$/.test(path)
	)
}

/** Run axe on a feature host and return violations other than the recorded shared findings. */
async function violations(page: Page, host = 'ef-hcm-employee-records'): Promise<string[]> {
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

/** Switch persona through the real Settings dialog and open Employee Records from catalogue search. */
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('EMPLOYEE_RECORDS')
	await page
		.getByRole('button', { name: /^Employee Records/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/employee-records$/)
	await expect(page.getByRole('grid', { name: 'Worker records' })).toBeVisible()
}

/** Rows of a named table in the feature. */
function rows(page: Page, table: string) {
	return page.locator(`ui5-table[accessible-name="${table}"] ui5-table-row[row-key]`)
}

/** Choose one server-filtered option by typing part of its name, after the search settles. */
async function pick(page: Page, label: string, text: string): Promise<void> {
	const host = page.locator(`ef-hcm-record-option-box ui5-combobox[accessible-name="${label}"]`)
	await host.getByRole('combobox', { name: label, exact: true }).fill(text)
	await page.waitForTimeout(300)
	await expect(host).not.toHaveAttribute('loading', /.*/)
	await host
		.getByRole('option', { name: new RegExp(text) })
		.first()
		.click()
	/** The ComboBox's selected identity. */
	const selected = () =>
		host.evaluate(
			/** Read the identity. */ (element) =>
				(element as unknown as { selectedValue: string }).selectedValue,
		)
	await expect.poll(selected).not.toBe('')
	await host.getByRole('combobox', { name: label, exact: true }).press('Tab')
	// Leaving the field must keep the identity, not fall back to the typed text.
	await expect.poll(selected).not.toBe('')
}

/** Run an Object Page action, opening the toolbar overflow when the column is narrow. */
async function act(page: Page, host: string, name: string): Promise<void> {
	const scope = page.locator(host)
	const button = scope.getByRole('button', { name, exact: true })
	await expect(
		/** Wait until the action is shown or folded into the overflow. */ async () =>
			expect(
				(await button.isVisible()) ||
					(await scope.getByRole('button', { name: 'Additional Options' }).isVisible()),
			).toBe(true),
	).toPass({ timeout: 15000 })
	if (!(await button.isVisible())) {
		await scope.getByRole('button', { name: 'Additional Options' }).click()
		await page.locator('ui5-toolbar-button, ui5-button').filter({ hasText: name }).last().click()
		return
	}
	await button.click()
}

/** Open a record section, choosing it from the native tab overflow when the column is narrow. */
async function tab(page: Page, name: string): Promise<void> {
	const record = page.locator('ef-hcm-worker-record')
	const item = record.getByRole('tab', { name, exact: true })
	if (await item.isVisible()) {
		await item.click()
		return
	}
	await record.getByRole('button', { name: 'More' }).click()
	await page
		.locator('.ui5-tab-overflow-itemContent-wrapper')
		.filter({ hasText: name })
		.last()
		.click()
	await expect(record.getByRole('tabpanel', { name })).toBeVisible()
}

/** Open one listed worker's record in the mid column. */
async function openRecord(page: Page, name: string): Promise<void> {
	await page.getByRole('searchbox', { name: 'Search name or worker number' }).fill(name)
	await page.getByRole('button', { name: 'Apply filters' }).click()
	await expect(rows(page, 'Worker records').first()).toContainText(name)
	await rows(page, 'Worker records').first().click()
	await expect(page.locator('ef-hcm-worker-record')).toContainText(name)
}

/** Move the wizard forward from the current step. */
async function nextStep(page: Page): Promise<void> {
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Next step' }).click()
}

/** Fill the wizard up to the duplicate check for one person. */
async function fillWizard(
	page: Page,
	person: { given: string; family: string; number: string },
): Promise<void> {
	const wizard = page.locator('ef-hcm-new-worker')
	await wizard.getByRole('textbox', { name: 'Given name' }).fill(person.given)
	await wizard.getByRole('textbox', { name: 'Family name' }).fill(person.family)
	await wizard.getByRole('textbox', { name: 'Birth date' }).fill('Mar 4, 1990')
	await wizard.getByRole('textbox', { name: 'Birth date' }).press('Enter')
	await wizard.getByRole('textbox', { name: 'Worker number' }).fill(person.number)
	await nextStep(page)
	await expect(wizard.getByRole('form', { name: 'Employment' })).toBeVisible()
	await pick(page, 'Legal entity', 'Dunder')
	await nextStep(page)
	await expect(wizard.getByRole('form', { name: 'Assignment and manager' })).toBeVisible()
	await wizard.getByRole('textbox', { name: 'Job title' }).fill('Sales associate')
	await pick(page, 'Unit', 'Scranton')
	await pick(page, 'Location', 'Scranton')
	await pick(page, 'Manager', 'Michael')
	await nextStep(page)
}

test('lists worker records and shows one record with its sections', /** REQ-EMPLOYEE-RECORDS-001, -002. */ async ({
	page,
}) => {
	await open(page)
	await expect(rows(page, 'Worker records').first()).toBeVisible()
	await openRecord(page, 'Jim Halpert')
	const record = page.locator('ef-hcm-worker-record')
	await tab(page, 'Personal')
	await tab(page, 'Employment')
	await expect(rows(page, 'Assignments').first()).toBeVisible()
	await tab(page, 'History')
	expect(await violations(page)).toEqual([])
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(record).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})

test('adds a contact point with a reason and reveals emergency information for a purpose', /** REQ-EMPLOYEE-RECORDS-003, -004. */ async ({
	page,
}) => {
	await open(page)
	await openRecord(page, 'Pam Beesly')
	const record = page.locator('ef-hcm-worker-record')
	await tab(page, 'Contact')
	await record.getByRole('button', { name: 'Add contact point' }).click()
	const dialog = page.locator('ef-hcm-record-dialog')
	await dialog.getByRole('combobox', { name: 'Type' }).click()
	await page.getByRole('option', { name: 'Mobile phone' }).click()
	const phone = `+1 570 555 ${String(Math.floor(Math.random() * 9000) + 1000)}`
	await dialog.getByRole('textbox', { name: 'Mobile phone' }).fill(phone)
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(dialog.getByRole('textbox', { name: 'Reason for change' })).toBeFocused()
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Confirmed by phone call')
	expect(await violations(page, 'ef-hcm-record-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText('Contact point added.')).toBeVisible()
	await tab(page, 'Contact')
	await expect(record.getByRole('link', { name: phone })).toBeVisible()
	// Deactivating keeps history and leaves room under the five-per-type limit for the next run.
	await rows(page, 'Contact points').filter({ hasText: phone }).hover()
	await record.getByRole('button', { name: `Deactivate ${phone}` }).click()
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Number no longer used')
	await dialog.getByRole('button', { name: 'Deactivate' }).click()
	await expect(page.getByText(`${phone} deactivated.`)).toBeVisible()
	await tab(page, 'Contact')
	await expect(record.getByRole('link', { name: phone })).toHaveCount(0)

	await act(page, 'ef-hcm-worker-record', 'Reveal emergency information')
	const reveal = page.locator('ef-hcm-record-dialog')
	await reveal.getByRole('textbox', { name: 'Purpose' }).fill('Medical incident at the office')
	await reveal.getByRole('button', { name: 'Reveal' }).click()
	await expect(reveal.getByText('Blood group')).toBeVisible()
	await expect(reveal.getByText('recorded in the audit trail')).toBeVisible()
	await reveal.getByRole('button', { name: 'Close' }).click()
	await expect(reveal).toHaveCount(0)
})

test('creates a worker through the wizard and resolves a duplicate with a reason', /** REQ-EMPLOYEE-RECORDS-005, -006. */ async ({
	page,
}) => {
	const suffix = randomUUID().slice(0, 6).toUpperCase()
	const family = `Records${suffix.replace(/[0-9]/g, /** A letter per digit. */ (d) => 'GHIJKLMNOP'[Number(d)] ?? 'Q')}`
	await open(page)
	await page.getByRole('button', { name: 'New worker' }).click()
	await expect(page).toHaveURL(/\/employee\/employee-records\/new$/)
	const wizard = page.locator('ef-hcm-new-worker')
	await nextStep(page)
	await expect(wizard.getByRole('textbox', { name: 'Given name' })).toBeFocused()
	expect(await violations(page, 'ef-hcm-new-worker')).toEqual([])
	await fillWizard(page, { given: 'Erin', family, number: `ER-${suffix}` })
	await expect(wizard.getByText('No existing person matches')).toBeVisible()
	await nextStep(page)
	// Keyboard: the footer steps back and forward without the pointer.
	await wizard.getByRole('button', { name: 'Previous step' }).focus()
	await page.keyboard.press('Enter')
	await expect(wizard.getByText('No existing person matches')).toBeVisible()
	await wizard.getByRole('button', { name: 'Next step' }).focus()
	await page.keyboard.press('Enter')
	await wizard.getByRole('textbox', { name: 'Reason for creation' }).fill('New hire for sales')
	expect(await violations(page, 'ef-hcm-new-worker')).toEqual([])
	await wizard.getByRole('button', { name: 'Create worker' }).click()
	await expect(page).toHaveURL(/\/employee\/employee-records\/[0-9a-f-]{36}$/)
	await expect(page.locator('ef-hcm-worker-record')).toContainText(`Erin ${family}`)

	await page.getByRole('button', { name: 'New worker' }).click()
	await fillWizard(page, { given: 'Erin', family, number: `ES-${suffix}` })
	await expect(rows(page, 'Possible duplicates').first()).toContainText(`Erin ${family}`)
	await nextStep(page)
	await expect(wizard.getByRole('grid', { name: 'Possible duplicates' })).toBeVisible()
	await wizard.getByRole('checkbox', { name: 'Create a new person' }).click()
	await wizard
		.getByRole('textbox', { name: 'Why these are different people' })
		.fill('Different national identifiers')
	await nextStep(page)
	await wizard.getByRole('textbox', { name: 'Reason for creation' }).fill('Second hire')
	await wizard.getByRole('button', { name: 'Create worker' }).click()
	await expect(page).toHaveURL(/\/employee\/employee-records\/[0-9a-f-]{36}$/)
	await expect(page.locator('ef-hcm-worker-record')).toContainText(`ES-${suffix}`)
})
