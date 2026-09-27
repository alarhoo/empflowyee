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
async function violations(page: Page, host = 'ef-hcm-employment-changes'): Promise<string[]> {
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

/** Switch persona through the real Settings dialog and open Employment Changes from catalogue search. */
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('EMPLOYMENT_CHANGES')
	await page
		.getByRole('button', { name: /^Employment Changes/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/employment-changes$/)
	await expect(page.getByRole('grid', { name: 'Change requests' })).toBeVisible()
}

/** Rows of a named table in the feature. */
function rows(page: Page, table: string) {
	return page.locator(`ui5-table[accessible-name="${table}"] ui5-table-row[row-key]`)
}

/** Choose one server-filtered option by typing part of its name, after the search settles. */
async function pick(page: Page, label: string, text: string): Promise<void> {
	const host = page.locator(`ef-hcm-change-option-box ui5-combobox[accessible-name="${label}"]`)
	await host.getByRole('combobox', { name: label, exact: true }).fill(text)
	await page.waitForTimeout(300)
	await expect(host).not.toHaveAttribute('loading', /.*/)
	const option = host.getByRole('option', { name: new RegExp(text) }).first()
	// Suggestions normally open while typing; F4 is the native keyboard way to open them otherwise.
	if (!(await option.isVisible({ timeout: 3000 }).catch(/** Not shown yet. */ () => false)))
		await host.getByRole('combobox', { name: label, exact: true }).press('F4')
	await option.click()
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
	const record = page.locator('ef-hcm-change-request')
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

/** An ISO date some days from today, in the DatePicker's medium display format. */
function mediumDaysAhead(days: number): string {
	const date = new Date()
	date.setDate(date.getDate() + days)
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Choose an option of a native Select by its visible text. */
async function choose(page: Page, scope: string, label: string, option: string): Promise<void> {
	await page.locator(scope).getByRole('combobox', { name: label, exact: true }).click()
	await page.getByRole('option', { name: option, exact: true }).click()
}

/** Move the wizard forward from the current step. */
async function nextStep(page: Page): Promise<void> {
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Next step' }).click()
}

/** Raise a request through the wizard up to the Details step. */
async function startRequest(
	page: Page,
	worker: string,
	type: string,
	reason: string,
	date?: string,
): Promise<void> {
	await page.getByRole('button', { name: 'New request' }).click()
	await expect(page).toHaveURL(/\/employee\/employment-changes\/new$/)
	await pick(page, 'Worker', worker)
	await expect(
		page.locator('ef-hcm-change-wizard').getByRole('grid', { name: 'Employments' }),
	).toBeVisible()
	await nextStep(page)
	await choose(page, 'ef-hcm-change-wizard', 'Change type', type)
	if (date) {
		const effective = page
			.locator('ef-hcm-change-wizard')
			.getByRole('textbox', { name: 'Effective date' })
		await effective.fill(date)
		await effective.press('Enter')
	}
	await choose(page, 'ef-hcm-change-wizard', 'Reason', reason)
	await page
		.locator('ef-hcm-change-wizard')
		.getByRole('textbox', { name: 'Reason details' })
		.fill(`Browser acceptance ${Date.now()}`)
	await nextStep(page)
}

/** Open the first listed request of a view. */
async function openFirst(page: Page, view: string, worker: string): Promise<void> {
	await page
		.getByRole('radio', { name: view })
		.or(page.getByRole('option', { name: view }))
		.first()
		.click()
	await expect(rows(page, 'Change requests').first()).toContainText(worker)
	await rows(page, 'Change requests').first().click()
	await expect(page.locator('ef-hcm-change-request')).toContainText(worker)
}

test('raises an employment type change through the wizard and an independent approver executes it', /** REQ-EMPLOYMENT-CHANGES-001, -002, -003, -007. */ async ({
	page,
}) => {
	await open(page)
	await startRequest(page, 'Pam', 'Employment type change', 'Conversion')
	const wizard = page.locator('ef-hcm-change-wizard')
	const typeBox = wizard.getByRole('combobox', { name: 'Employment type', exact: true })
	const current = (await typeBox.textContent())?.includes('Permanent') ? 'Permanent' : 'Fixed term'
	const proposed = current === 'Permanent' ? 'Fixed term' : 'Permanent'
	// Nothing changed yet: Details refuses to continue.
	await nextStep(page)
	await expect(wizard.getByText('Change at least one fact.')).toBeVisible()
	await choose(page, 'ef-hcm-change-wizard', 'Employment type', proposed)
	expect(await violations(page, 'ef-hcm-change-wizard')).toEqual([])
	// Keyboard: the footer moves on without the pointer.
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Next step' }).focus()
	await page.keyboard.press('Enter')
	const review = rows(page, 'Current and proposed facts')
	await expect(review.first()).toContainText(proposed)
	expect(await violations(page, 'ef-hcm-change-wizard')).toEqual([])
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Submit request' }).click()
	await expect(page).toHaveURL(/\/employee\/employment-changes\/[0-9a-f-]{36}$/)
	const request = page.locator('ef-hcm-change-request')
	await expect(request.getByText('Pending approval').first()).toBeVisible()

	await open(page, 'David Wallace')
	await openFirst(page, 'Awaiting my decision', 'Pam Beesly')
	await act(page, 'ef-hcm-change-request', 'Approve')
	const dialog = page.locator('ef-hcm-change-dialog')
	await dialog.getByRole('button', { name: 'Approve' }).click()
	await expect(dialog.getByRole('textbox', { name: 'Decision reason' })).toBeFocused()
	await dialog.getByRole('textbox', { name: 'Decision reason' }).fill('Conversion agreed')
	expect(await violations(page, 'ef-hcm-change-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Approve' }).click()
	await expect(page.getByText('The change was executed.')).toBeVisible()
	await tab(page, 'Execution')
	await expect(rows(page, 'Execution steps').first()).toContainText('Change employment facts')
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(request).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})

test('keeps a future suspension until its date and lets the requester cancel it', /** REQ-EMPLOYMENT-CHANGES-005. */ async ({
	page,
}) => {
	await open(page)
	await startRequest(page, 'Angela', 'Suspension', 'Investigation', mediumDaysAhead(40))
	const wizard = page.locator('ef-hcm-change-wizard')
	await expect(
		wizard.getByText('This change sets the employment status to Suspended'),
	).toBeVisible()
	await nextStep(page)
	await expect(rows(page, 'Current and proposed facts').first()).toContainText('Suspended')
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Submit request' }).click()
	await expect(page).toHaveURL(/\/employee\/employment-changes\/[0-9a-f-]{36}$/)
	await act(page, 'ef-hcm-change-request', 'Cancel request')
	const dialog = page.locator('ef-hcm-change-dialog')
	await dialog.getByRole('textbox', { name: 'Reason for cancelling' }).fill('Raised in error')
	await dialog.getByRole('button', { name: 'Cancel request' }).click()
	await expect(page.getByText('The request was cancelled.')).toBeVisible()
	await expect(page.locator('ef-hcm-change-request').getByText('Cancelled').first()).toBeVisible()
})
