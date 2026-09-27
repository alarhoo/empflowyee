import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

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
async function violations(page: Page, host: string): Promise<string[]> {
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

/** Raise a request for Jim through the real HR Service Desk API as Toby. */
async function raise(page: Page, subject: string): Promise<void> {
	const response = await page.request.post(
		'http://127.0.0.1:4402/api/v1/employee/hr-service/requests',
		{
			headers: {
				host: 'acme.localhost',
				'x-hcm-development-persona': 'toby',
				origin: 'http://acme.localhost:4302',
				'sec-fetch-site': 'same-origin',
				'Idempotency-Key': randomUUID(),
			},
			data: {
				subjectWorkerId: 'dunder-mifflin/worker/jim',
				typeId: 'dunder-mifflin/hr-request-type/general-question',
				priority: 'P2',
				subject,
				description: 'Jim asked who approves the parking change.',
				reason: 'Raised at the front desk.',
			},
		},
	)
	expect(response.status(), await response.text()).toBe(201)
}

/** Switch persona through the real Settings dialog and open HR Service Desk from catalogue search. */
async function open(page: Page, name = 'Toby Flenderson'): Promise<void> {
	page.on(
		'pageerror',
		/** Surface component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name, exact: false }).click()
	await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('HR_SERVICE_DESK')
	await page
		.getByRole('button', { name: /^HR Service Desk/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/hr-service-desk$/)
	await expect(page.getByRole('grid', { name: 'HR requests' })).toBeVisible()
}

/** Run an Object Page action, opening the toolbar overflow when the column is narrow. */
async function act(page: Page, name: string): Promise<void> {
	const scope = page.locator('ef-hcm-hr-request-page')
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

/** Choose one server-filtered option by typing part of its name. */
async function pick(page: Page, label: string, text: string): Promise<void> {
	const host = page.locator(`ef-hcm-hr-option-box ui5-combobox[accessible-name="${label}"]`)
	await host.getByRole('combobox', { name: label, exact: true }).fill(text)
	await page.waitForTimeout(300)
	await expect(host).not.toHaveAttribute('loading', /.*/)
	const option = host.getByRole('option', { name: new RegExp(text) }).first()
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
}

/** Choose an option of a native Select by its visible text. */
async function choose(page: Page, scope: string, label: string, option: string): Promise<void> {
	await page.locator(scope).getByRole('combobox', { name: label, exact: true }).click()
	await page.getByRole('option', { name: option, exact: true }).click()
}

test('works a request from the queue: note, reply, assign and resolve', /** REQ-HR-SERVICE-DESK-001 to -005. */ async ({
	page,
}) => {
	const stamp = Date.now().toString(36).toUpperCase().slice(-5)
	const subject = `Parking ${stamp}`
	await raise(page, subject)
	await open(page)
	await page.getByRole('searchbox', { name: 'Search request number or subject' }).fill(stamp)
	await page.getByRole('button', { name: 'Apply filters' }).click()
	const rows = page.locator('ui5-table[accessible-name="HR requests"] ui5-table-row[row-key]')
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText(subject)
	await expect(rows.first()).toContainText('On track')
	await expect(rows.first()).toContainText('New')
	expect(await violations(page, 'ef-hcm-hr-service-desk')).toEqual([])
	await rows.first().click()
	const request = page.locator('ef-hcm-hr-request-page')
	await expect(request).toContainText('Jim asked who approves the parking change.')

	// An internal note keeps the request New; the first reply opens it and meets first response.
	await choose(page, 'ef-hcm-hr-request-page', 'Send as', 'Internal note')
	await request.getByRole('textbox', { name: 'Message' }).fill('Check with facilities first.')
	await request.getByRole('button', { name: 'Add note' }).click()
	await expect(page.getByText('The internal note was added.')).toBeVisible()
	await expect(request.getByText('Internal note').first()).toBeVisible()
	await choose(page, 'ef-hcm-hr-request-page', 'Send as', 'Reply to the employee')
	await request
		.getByRole('textbox', { name: 'Message' })
		.fill('Facilities approves it; I will confirm.')
	await request.getByRole('button', { name: 'Send reply' }).click()
	await expect(page.getByText('The reply was sent.')).toBeVisible()
	await expect(rows.first()).toContainText('Open')
	expect(await violations(page, 'ef-hcm-hr-request-page')).toEqual([])

	await act(page, 'Assign')
	const dialog = page.locator('ef-hcm-hr-request-dialog')
	await pick(page, 'Agent', 'Toby')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('I will follow up with facilities.')
	expect(await violations(page, 'ef-hcm-hr-request-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Assign', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(/is assigned to Toby Flenderson\./)).toBeVisible()

	await act(page, 'Change status')
	await choose(page, 'ef-hcm-hr-request-dialog', 'New status', 'Resolved')
	await choose(page, 'ef-hcm-hr-request-dialog', 'Resolution', 'Answered')
	await dialog
		.getByRole('textbox', { name: 'Resolution summary' })
		.fill('Facilities approved the parking change.')
	await dialog.getByRole('button', { name: 'Change status', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(/is now Resolved\./)).toBeVisible()
	await expect(request).toContainText('Employee may reopen until')
	await expect(rows.first()).toContainText('Met')
})

test('lists configuration and keeps published service levels read-only', /** REQ-HR-SERVICE-DESK-006. */ async ({
	page,
}) => {
	await open(page)
	await page
		.getByRole('radio', { name: 'Configuration' })
		.or(page.getByRole('option', { name: 'Configuration' }))
		.first()
		.click()
	const rows = page.locator('ui5-table[accessible-name="Teams"] ui5-table-row[row-key]')
	await expect(rows.first()).toContainText('HR Operations')
	await choose(page, 'ef-hcm-hr-service-desk', 'Configuration kind', 'Service levels')
	const levels = page.locator('ui5-table[accessible-name="Service levels"] ui5-table-row[row-key]')
	await expect(levels.first()).toContainText('standard version 1')
	await levels.first().click()
	const dialog = page.locator('ef-hcm-hr-config-dialog')
	await expect(dialog.getByText('This version is published and cannot change.')).toBeVisible()
	expect(await violations(page, 'ef-hcm-hr-config-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Close', exact: true }).click()
	await expect(dialog).toHaveCount(0)
})

test('keeps the desk away from other personas', /** REQ-HR-SERVICE-DESK-007. */ async ({
	page,
}) => {
	await page.goto('/employee/hr-service-desk')
	await expect(page.getByRole('grid', { name: 'HR requests' })).toHaveCount(0)
})
