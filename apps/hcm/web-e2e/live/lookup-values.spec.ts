import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/** Shared inverted positive ObjectStatus contrast finding; see the HCM-2 validation records. */
const SHARED_FINDINGS = ['color-contrast']

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
	const result = await new AxeBuilder({ page }).include('ef-hcm-lookup-values').analyze()
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
async function open(page: Page, name = 'David Wallace'): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('LOOKUP_VALUES')
	await page
		.getByRole('button', { name: /^Lookup Values/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/workforce-foundation\/lookup-values$/)
	await expect(page.getByRole('listitem', { name: /^Worker types / })).toBeVisible()
}

/** Open one set from the begin column. */
async function openSet(page: Page, label: string): Promise<void> {
	await page.getByRole('listitem', { name: new RegExp(`^${label} Maintained`) }).click()
	await expect(page.getByRole('grid', { name: label })).toBeVisible()
}

/** Fill the reason and confirm a Dialog. */
async function confirm(page: Page, dialog: string, button: string, reason: string): Promise<void> {
	await expect(page.getByRole('dialog', { name: dialog })).toBeVisible()
	const view = page.locator('ef-hcm-lookup-value-dialog, ef-hcm-lookup-active-dialog')
	await view.getByRole('textbox', { name: 'Reason for change' }).fill(reason)
	await view.getByRole('button', { name: button, exact: true }).click()
	await expect(view).toHaveCount(0)
}

test('lists sets by ownership and keeps product lists read-only', /** REQ-001 and REQ-004: real sets, deep links and no product mutation. */ async ({
	page,
}) => {
	await open(page)
	const sets = page.locator('ef-hcm-lookup-values ui5-list')
	await expect(sets).toContainText('Organisation lists')
	await expect(sets).toContainText('Product lists')
	await expect(
		page.getByRole('listitem', { name: /^Worker types Maintained by your organisation 3 active/ }),
	).toBeVisible()
	await expect(
		page.getByRole('listitem', { name: /^Genders Maintained by the product 4 active/ }),
	).toBeVisible()
	await openSet(page, 'Genders')
	await expect(page).toHaveURL(/\/workforce-foundation\/lookup-values\/genders$/)
	const genders = page.locator('ef-hcm-lookup-set')
	await expect(genders.getByText('Read-only view. Changes are not available.')).toBeVisible()
	for (const name of [/^Add value/, /^Edit /, /^Retire /])
		await expect(genders.getByRole('button', { name })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
	await page.goBack()
	await expect(page).toHaveURL(/\/workforce-foundation\/lookup-values$/)
	await expect(page.getByRole('grid', { name: 'Genders' })).toHaveCount(0)
	await page.goForward()
	await expect(page.getByRole('grid', { name: 'Genders' })).toBeVisible()
	await page.evaluate(
		/** Follow an in-app deep link to a list that does not exist. */ () => {
			history.pushState({}, '', '/workforce-foundation/lookup-values/unknown')
			dispatchEvent(new PopStateEvent('popstate'))
		},
	)
	await expect(
		page.getByText('The requested list does not exist. Choose a list below.'),
	).toBeVisible()
})

test('adds, edits, retires and reactivates a tenant value', /** REQ-002, REQ-003 and REQ-007: Signal Form Dialogs over the real API. */ async ({
	page,
}) => {
	const code = `E2E_${Date.now().toString(36).toUpperCase()}`
	await open(page)
	await openSet(page, 'Employment end reasons')
	const set = page.locator('ef-hcm-lookup-set')
	await set.getByRole('button', { name: 'Add value', exact: true }).click()
	await expect(
		page.getByRole('dialog', { name: 'Add value to Employment end reasons' }),
	).toBeVisible()
	const add = page.locator('ef-hcm-lookup-value-dialog')
	await add.getByRole('textbox', { name: 'Code' }).fill('bad code')
	await add.getByRole('textbox', { name: 'Name' }).fill('Mutual agreement')
	await add.getByRole('textbox', { name: 'Reason for change' }).fill('Browser acceptance')
	await add.getByRole('button', { name: 'Add value', exact: true }).click()
	await expect(
		page.getByRole('dialog', { name: 'Add value to Employment end reasons' }),
	).toBeVisible()
	await expect(add.getByRole('textbox', { name: 'Code' })).toHaveAttribute('aria-invalid', 'true')
	await add.getByRole('textbox', { name: 'Code' }).fill(code)
	await add.getByRole('checkbox', { name: 'Voluntary' }).click()
	expect(await violations(page)).toEqual([])
	await add.getByRole('button', { name: 'Add value', exact: true }).click()
	await expect(add).toHaveCount(0)
	await expect(page.getByText('Mutual agreement saved.')).toBeVisible()
	const row = set.getByRole('row').filter({ hasText: `(${code})` })
	await expect(row.getByRole('checkbox', { name: 'Voluntary' })).toBeChecked()
	await row.getByRole('button', { name: 'Edit Mutual agreement' }).click()
	await expect(page.getByRole('dialog', { name: 'Edit Mutual agreement' })).toBeVisible()
	const edit = page.locator('ef-hcm-lookup-value-dialog')
	await expect(edit.getByRole('textbox', { name: 'Code' })).toHaveCount(0)
	await edit.getByRole('textbox', { name: 'Name' }).fill('Mutual separation')
	await confirm(page, 'Edit Mutual agreement', 'Save', 'Align with policy wording')
	const renamed = set.getByRole('row').filter({ hasText: `Mutual separation (${code})` })
	await expect(renamed).toBeVisible()
	await renamed.getByRole('button', { name: 'Retire Mutual separation' }).click()
	await confirm(page, 'Retire Mutual separation', 'Retire', 'No longer offered')
	await expect(renamed).toContainText('Inactive')
	await renamed.getByRole('button', { name: 'Reactivate Mutual separation' }).click()
	await confirm(page, 'Reactivate Mutual separation', 'Reactivate', 'Offered again')
	await expect(renamed).toContainText('Active')
	await expect(set.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
})

test('keeps a dirty draft until the discard is confirmed', /** REQ-006: Escape and Cancel ask before discarding. */ async ({
	page,
}) => {
	await open(page)
	await openSet(page, 'Worker types')
	await page.locator('ef-hcm-lookup-set').getByRole('button', { name: 'Add value' }).click()
	await expect(page.getByRole('dialog', { name: 'Add value to Worker types' })).toBeVisible()
	const add = page.locator('ef-hcm-lookup-value-dialog')
	await add.getByRole('textbox', { name: 'Name' }).fill('Seasonal')
	await add.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible()
	const discard = add.locator('ef-hcm-discard-dialog')
	await discard.getByRole('button', { name: 'Keep editing' }).click()
	await expect(add.getByRole('textbox', { name: 'Name' })).toHaveValue('Seasonal')
	await add.getByRole('button', { name: 'Cancel', exact: true }).click()
	await discard.getByRole('button', { name: 'Discard changes' }).click()
	await expect(add).toHaveCount(0)
})

test('lets HR Operations read every set while the API refuses writes', /** REQ-005 and DEC-HCM2-018: discovery and reads never authorize a write. */ async ({
	page,
	request,
}) => {
	await open(page, 'Toby Flenderson')
	await openSet(page, 'Worker types')
	const set = page.locator('ef-hcm-lookup-set')
	await expect(set.getByRole('row').filter({ hasText: 'Employee (EMPLOYEE)' })).toBeVisible()
	for (const name of [/^Add value/, /^Edit /, /^Retire /])
		await expect(set.getByRole('button', { name })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
	const headers = {
		host: 'acme.localhost',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'content-type': 'application/json',
		'idempotency-key': crypto.randomUUID(),
		'x-hcm-development-persona': 'toby',
	}
	const write = await request.post(
		'http://127.0.0.1:4402/api/v1/workforce-foundation/lookup-sets/worker-types/values',
		{
			headers,
			data: {
				code: 'TOBY_TYPE',
				name: 'Toby',
				description: '',
				sortOrder: 1,
				attributes: { statutoryClass: 'Employee', payrollEligible: true, benefitEligible: true },
				reason: 'Not allowed',
			},
		},
	)
	expect(write.status()).toBe(403)
})

test('stays usable at supported widths', /** REQ-006: FCL columns, popins and no outer overflow. */ async ({
	page,
}) => {
	await open(page)
	await openSet(page, 'Worker event types')
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(page.getByRole('grid', { name: 'Worker event types' })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native table popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})

test('reports a failed load truthfully and recovers with Retry', /** REQ-006: no fixture fallback; retry reloads real data. */ async ({
	page,
}) => {
	await open(page)
	await page.route(
		'**/api/v1/workforce-foundation/lookup-sets/countries/values?**',
		/** Fail only the country values read. */ (route) => route.abort(),
	)
	await page.getByRole('listitem', { name: /^Countries Maintained/ }).click()
	const set = page.locator('ef-hcm-lookup-set')
	await expect(set.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
	await expect(set.getByRole('row')).toHaveCount(0)
	await page.unroute('**/api/v1/workforce-foundation/lookup-sets/countries/values?**')
	await set.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Countries' })).toBeVisible()
})
