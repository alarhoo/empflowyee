import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/** Shared inverted positive ObjectStatus contrast finding; see the HCM-2 validation records. */
const SHARED_FINDINGS = ['color-contrast']

/** Run axe on the feature and return app-attributable rule identities. */
async function violations(page: Page): Promise<string[]> {
	const result = await new AxeBuilder({ page }).include('ef-hcm-identification-types').analyze()
	return result.violations
		.map(/** Rule identity. */ (item) => item.id)
		.filter(/** Drop recorded shared findings only. */ (id) => !SHARED_FINDINGS.includes(id))
}

/** Switch persona through the real Settings dialog and open the app from catalogue search. */
async function open(page: Page, loaded = true): Promise<void> {
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
	await page.getByRole('option', { name: 'David Wallace', exact: false }).click()
	await expect(page.getByRole('button', { name: 'David Wallace', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('IDENTIFICATION_TYPES')
	await page
		.getByRole('button', { name: /^Identification Types/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/workforce-foundation\/identification-types$/)
	if (loaded) await expect(page.getByRole('grid', { name: 'Identification types' })).toBeVisible()
}

test('reads the product catalogue with filters and no mutation controls', /** REQ-001, REQ-002, REQ-003: real product rows, semantic characteristics and no tenant actions. */ async ({
	page,
}) => {
	await open(page)
	const view = page.locator('ef-hcm-identification-types')
	const ssn = view.getByRole('row').filter({ hasText: 'Social Security Number (SSN)' })
	await expect(ssn).toContainText('United States')
	await expect(ssn).toContainText('Nine digits, optionally grouped 3-2-4')
	await expect(
		ssn.getByRole('checkbox', { name: 'Social Security Number requires masking' }),
	).toBeChecked()
	await expect(view.getByRole('row').filter({ hasText: 'Passport (PASSPORT)' })).toContainText(
		'All countries',
	)
	await expect(view).not.toContainText('^[')
	for (const name of [/^Create/, /^Edit/, /^Delete/, /^Disable/])
		await expect(view.getByRole('button', { name })).toHaveCount(0)
	await view.getByRole('searchbox', { name: 'Search code or name' }).fill('aadh')
	await expect(view.getByRole('row')).toHaveCount(2)
	await view.getByRole('searchbox', { name: 'Search code or name' }).fill('')
	const country = view.getByRole('combobox', { name: 'Issuing country', exact: true })
	await country.fill('India')
	await page.getByRole('option', { name: /^India/ }).click()
	await expect(view.getByRole('row')).toHaveCount(4)
	await expect(view.getByRole('row').filter({ hasText: 'Permanent Account Number' })).toBeVisible()
	await country.fill('All countries')
	await page.getByRole('option', { name: /^All countries/ }).click()
	await expect(view.getByRole('row')).toHaveCount(3)
	await country.fill('')
	await country.press('Enter')
	await view.getByRole('combobox', { name: 'Status', exact: true }).click()
	await page.getByRole('option', { name: 'Inactive', exact: true }).click()
	await expect(view.getByText('No identification types match these filters')).toBeVisible()
	expect(await violations(page)).toEqual([])
})

test('sorts through native view settings and stays accessible at supported widths', /** REQ-005: keyboard-reachable sorting, popins and no outer overflow. */ async ({
	page,
}) => {
	await open(page)
	const view = page.locator('ef-hcm-identification-types')
	await view.getByRole('button', { name: 'Identification type view settings' }).click()
	await expect(page.getByRole('dialog', { name: 'View Settings' })).toBeVisible()
	// Native rows in order: Ascending, Descending, then the declared fields (Name, Code).
	await page.getByRole('radio', { name: 'Item Selection.' }).nth(3).click()
	await page.getByRole('button', { name: 'OK', exact: true }).click()
	await expect(view.getByRole('row').nth(1)).toContainText('(AADHAAR)')
	await expect(view.getByRole('row').nth(2)).toContainText('(DRIVING_LICENCE)')
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(page.getByRole('grid', { name: 'Identification types' })).toBeVisible()
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native table popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})

test('reports a failed load truthfully and recovers with Retry', /** REQ-005: no fixture fallback; retry reloads real data. */ async ({
	page,
}) => {
	await page.route(
		'**/api/v1/workforce-foundation/identification-types',
		/** Fail only the catalogue read. */ (route) => route.abort(),
	)
	await open(page, false)
	const view = page.locator('ef-hcm-identification-types')
	await expect(
		view.getByText('The identification types could not be loaded. Try again.'),
	).toBeVisible()
	await expect(view.getByRole('row')).toHaveCount(0)
	await page.unroute('**/api/v1/workforce-foundation/identification-types')
	await view.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(view.getByRole('row').filter({ hasText: 'Passport (PASSPORT)' })).toBeVisible()
})

test('lets HR Operations read through the API while refusing any write', /** REQ-004: navigation never authorizes; the product catalogue has no write route. */ async ({
	request,
}) => {
	const headers = {
		host: 'acme.localhost',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
	}
	const base = 'http://127.0.0.1:4402/api/v1/workforce-foundation/identification-types'
	expect(
		(
			await request.get(base, { headers: { ...headers, 'x-hcm-development-persona': 'toby' } })
		).status(),
	).toBe(200)
	expect(
		(
			await request.get(base, { headers: { ...headers, 'x-hcm-development-persona': 'jim' } })
		).status(),
	).toBe(403)
	expect(
		(
			await request.post(base, {
				headers: {
					...headers,
					'x-hcm-development-persona': 'david',
					'Idempotency-Key': crypto.randomUUID(),
				},
				data: { code: 'NEW_TYPE', name: 'New type' },
			})
		).status(),
	).toBe(404)
})
