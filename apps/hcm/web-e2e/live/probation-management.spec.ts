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

/** An ISO date some days from today. */
function daysAhead(days: number): string {
	const date = new Date()
	date.setDate(date.getDate() + days)
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** A date in the DatePicker's medium display format. */
function medium(iso: string): string {
	return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

/** Hire a new worker in probation through the real Employee Records API as Toby. */
async function hire(page: Page, stamp: string, probationEndDate: string): Promise<void> {
	const response = await page.request.post('http://127.0.0.1:4402/api/v1/employee/records', {
		headers: {
			host: 'acme.localhost',
			'x-hcm-development-persona': 'toby',
			origin: 'http://acme.localhost:4302',
			'sec-fetch-site': 'same-origin',
			'Idempotency-Key': randomUUID(),
		},
		data: {
			person: { givenName: 'Kelly', familyName: `Kapoor${stamp}` },
			worker: { workerNumber: `DM-K${stamp}`, workerTypeId: 'dunder-mifflin/worker-type/employee' },
			employment: {
				legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
				employmentType: 'Permanent',
				hireDate: daysAhead(-30),
				workEmail: `kelly.${stamp.toLowerCase()}@dundermifflin.example`,
				probationEndDate,
			},
			assignment: {
				unitId: 'dunder-mifflin/organisation/scranton',
				departmentId: 'dunder-mifflin/department/sales',
				designationId: 'dunder-mifflin/designation/sales-representative',
				locationId: 'dunder-mifflin/location/scranton',
				jobTitle: 'Customer Service',
				workMode: 'OnSite',
				fullTimeEquivalent: 1,
				standardHoursPerWeek: 40,
			},
			managerWorkerId: 'dunder-mifflin/worker/michael',
			duplicateResolution: { kind: 'none' },
			reason: 'Browser probation acceptance',
		},
	})
	expect(response.status(), await response.text()).toBe(201)
}

/** Switch persona through the real Settings dialog and open Probation Management from catalogue search. */
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('PROBATION_MANAGEMENT')
	await page
		.getByRole('button', { name: /^Probation Management/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/probation-management$/)
	await expect(page.getByRole('grid', { name: 'Probation cases' })).toBeVisible()
}

/** Run an Object Page action, opening the toolbar overflow when the column is narrow. */
async function act(page: Page, name: string): Promise<void> {
	const scope = page.locator('ef-hcm-probation-case-review')
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
	const host = page.locator(`ef-hcm-probation-option-box ui5-combobox[accessible-name="${label}"]`)
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

test('assigns a reviewer and extends a probation once, scheduling the next Final review', /** REQ-PROBATION-MANAGEMENT-001 to -004. */ async ({
	page,
}) => {
	const stamp = Date.now().toString(36).toUpperCase().slice(-5)
	const end = daysAhead(60)
	await hire(page, stamp, end)
	await open(page)
	await page.getByRole('searchbox', { name: 'Search employee name or number' }).fill(stamp)
	await page.getByRole('button', { name: 'Apply filters' }).click()
	const rows = page.locator('ui5-table[accessible-name="Probation cases"] ui5-table-row[row-key]')
	await expect(rows).toHaveCount(1)
	await expect(rows.first()).toContainText('In probation')
	await expect(rows.first()).toContainText('Final review')
	expect(await violations(page, 'ef-hcm-probation-management')).toEqual([])
	await rows.first().click()
	const review = page.locator('ef-hcm-probation-case-review')
	await expect(review).toContainText(`Kelly Kapoor${stamp}`)
	await expect(review).toContainText('Not assigned')

	// The reviewer is explicit; the manager is only suggested.
	await act(page, 'Assign reviewer')
	const dialog = page.locator('ef-hcm-probation-dialog')
	await pick(page, 'Reviewer', 'Michael')
	await dialog
		.getByRole('textbox', { name: 'Reason' })
		.fill('Michael manages the Scranton sales team')
	expect(await violations(page, 'ef-hcm-probation-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Assign', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(`Michael Scott now reviews Kelly Kapoor${stamp}.`)).toBeVisible()

	await act(page, 'Record decision')
	await choose(page, 'ef-hcm-probation-dialog', 'Outcome', 'Extend')
	const extended = daysAhead(90)
	const picker = dialog.getByRole('textbox', { name: 'Extended end date' })
	await picker.fill(medium(extended))
	await picker.press('Enter')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('Needs more time with key accounts')
	await dialog.getByRole('button', { name: 'Record decision', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(
		page.getByText(/Probation was extended to .*the next Final review is scheduled\./),
	).toBeVisible()
	await expect(review.getByText('Decided').first()).toBeVisible()
	await expect(rows.first()).toContainText('Extended')
	expect(await violations(page, 'ef-hcm-probation-management')).toEqual([])

	// The next Final review carries the reviewer, and a second extension is not offered.
	await rows.first().click()
	await expect(review).toContainText('Michael Scott')
	await act(page, 'Record decision')
	await dialog.getByRole('combobox', { name: 'Outcome', exact: true }).click()
	await expect(page.getByRole('option', { name: 'Extend', exact: true })).toHaveCount(0)
	await page.getByRole('option', { name: 'Confirm', exact: true }).click()
	await dialog.getByRole('button', { name: 'Close', exact: true }).click()
	const discard = page.locator('ef-hcm-discard-dialog')
	if (
		await discard
			.getByRole('button', { name: 'Discard' })
			.isVisible()
			.catch(/** Clean draft. */ () => false)
	)
		await discard.getByRole('button', { name: 'Discard' }).click()
	await expect(dialog).toHaveCount(0)
})

test('keeps probation management away from other personas', /** REQ-PROBATION-MANAGEMENT-005. */ async ({
	page,
}) => {
	await page.goto('/employee/probation-management')
	await expect(page.getByRole('grid', { name: 'Probation cases' })).toHaveCount(0)
})
