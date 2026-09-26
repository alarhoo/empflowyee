import { randomUUID } from 'node:crypto'
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
async function violations(page: Page, host = 'ef-hcm-job-catalogue'): Promise<string[]> {
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
async function open(page: Page, name: string): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('JOB_CATALOGUE')
	await page
		.getByRole('button', { name: /^Job Catalogue/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/job-architecture\/job-catalogue$/)
	await expect(page.getByRole('grid', { name: 'Catalogue versions' })).toBeVisible()
}

/** Rows of a named table in the feature. */
function rows(page: Page, table: string) {
	return page.locator(`ef-hcm-job-catalogue ui5-table[accessible-name="${table}"] ui5-table-row`)
}

/** The mid-column detail host. */
function detail(page: Page, host: 'ef-hcm-job-catalogue-version' | 'ef-hcm-job-profile-version') {
	return page.locator(host)
}

/** The catalogue as David, read through the real API, to settle state left by an earlier run. */
async function catalogue(page: Page) {
	const reply = await page.request.get('http://127.0.0.1:4402/api/v1/job-architecture/catalogues', {
		headers: { host: 'acme.localhost', 'x-hcm-development-persona': 'david' },
	})
	return (await reply.json()).items[0] as {
		id: string
		currentVersionId: string
		versions: { id: string; status: string; effectiveFrom: string | null; current: boolean }[]
	}
}

/** The day after an ISO date, or today when that is later. */
function nextDate(after: string): string {
	const next = new Date(`${after}T00:00:00Z`)
	next.setUTCDate(next.getUTCDate() + 1)
	const today = new Date().toISOString().slice(0, 10)
	const value = next.toISOString().slice(0, 10)
	return value > today ? value : today
}

/** An ISO date in the DatePicker's medium display format. */
function medium(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	})
}

/** Add a family, check a duplicate code and submit the open draft for review. */
async function extendAndSubmit(page: Page): Promise<void> {
	const version = detail(page, 'ef-hcm-job-catalogue-version')
	const code = `QA_${randomUUID().slice(0, 8).toUpperCase().replace(/-/g, '')}`
	await version.getByRole('tab', { name: 'Job families' }).click()
	await page.getByRole('button', { name: 'Add family' }).click()
	const element = page.locator('ef-hcm-job-catalogue-element-dialog')
	await element.getByRole('textbox', { name: 'Code' }).fill(code)
	await element.getByRole('textbox', { name: 'Name' }).fill('Quality Assurance')
	await element.getByRole('textbox', { name: 'Reason for change' }).fill('Browser acceptance')
	await element.getByRole('button', { name: 'Add' }).click()
	await expect(element).toHaveCount(0)
	await expect(version.locator('ui5-tree-item[text="Quality Assurance"]')).not.toHaveCount(0)

	await page.getByRole('button', { name: 'Add family' }).click()
	await element.getByRole('textbox', { name: 'Code' }).fill('SALES')
	await element.getByRole('textbox', { name: 'Name' }).fill('Duplicate')
	await element.getByRole('textbox', { name: 'Reason for change' }).fill('Browser acceptance')
	await element.getByRole('button', { name: 'Add' }).click()
	await expect(element).toContainText('Code is already used in this version.')
	await element.getByRole('button', { name: 'Cancel' }).click()
	await page.getByRole('button', { name: 'Discard changes' }).click()
	await expect(element).toHaveCount(0)

	await page.getByRole('button', { name: 'Submit for review' }).click()
	const lifecycle = page.locator('ef-hcm-job-catalogue-lifecycle-dialog')
	await lifecycle.getByRole('textbox', { name: 'Reason for change' }).fill('Ready for review')
	await lifecycle.getByRole('button', { name: 'Submit' }).click()
	await expect(lifecycle).toHaveCount(0)
	await expect(version).toContainText('In review')
	await expect(page.getByRole('button', { name: 'Add family' })).toHaveCount(0)
}

test('lets HR read the published catalogue and job profiles without mutation controls', /** REQ-JOB-CATALOGUE-001, REQ-JOB-CATALOGUE-005. */ async ({
	page,
}) => {
	await open(page, 'Toby Flenderson')
	await expect(rows(page, 'Catalogue versions').filter({ hasText: '(current)' })).toHaveCount(1)
	await rows(page, 'Catalogue versions').filter({ hasText: '(current)' }).click()
	const version = detail(page, 'ef-hcm-job-catalogue-version')
	await expect(version).toContainText('Published')
	await version.getByRole('tab', { name: 'Job families' }).click()
	await expect(version.locator('ui5-tree-item[text="Sales"]')).toHaveCount(1)
	await expect(version.locator('ui5-tree-item[text="Inside Sales"]')).toHaveCount(1)
	await version.getByRole('tab', { name: 'Bands and grades' }).click()
	await expect(
		version.locator('ui5-table[accessible-name="Grades"] ui5-table-row[row-key]'),
	).not.toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Create draft' })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Add family' })).toHaveCount(0)
	expect(await violations(page)).toEqual([])

	await page.getByRole('option', { name: 'Job profiles' }).click()
	await expect(rows(page, 'Job profiles').filter({ hasText: 'Sales Representative' })).toHaveCount(
		1,
	)
	await rows(page, 'Job profiles').filter({ hasText: 'Sales Representative' }).click()
	const profile = detail(page, 'ef-hcm-job-profile-version')
	await expect(profile).toContainText('Inside Sales')
	await profile.getByRole('tab', { name: 'Allowed grades' }).click()
	await expect(profile).toContainText('Default grade')
	await profile.getByRole('tab', { name: 'Versions' }).click()
	await expect(profile.locator('ui5-timeline-item')).not.toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Edit draft' })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'New job profile' })).toHaveCount(0)
	expect(await violations(page)).toEqual([])
})

test('drafts, extends, submits and publishes a catalogue version', /** REQ-JOB-CATALOGUE-002, REQ-JOB-CATALOGUE-004. */ async ({
	page,
}) => {
	const before = await catalogue(page)
	await open(page, 'David Wallace')
	const current = before.versions.find(/** Current. */ (v) => v.current)
	let pending = before.versions.find(
		/** Left open by an earlier run. */ (v) => v.status === 'Draft' || v.status === 'InReview',
	)
	if (!pending) {
		await rows(page, 'Catalogue versions').filter({ hasText: '(current)' }).click()
		await page.getByRole('button', { name: 'Create draft' }).click()
		const dialog = page.locator('ef-hcm-job-catalogue-lifecycle-dialog')
		await dialog
			.getByRole('textbox', { name: 'Change summary' })
			.fill('Adds a family for browser acceptance.')
		await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Browser acceptance')
		await dialog.getByRole('button', { name: 'Create draft' }).click()
		await expect(dialog).toHaveCount(0)
		pending = (await catalogue(page)).versions.find(/** Open draft. */ (v) => v.status === 'Draft')
	} else
		await rows(page, 'Catalogue versions')
			.filter({ hasText: pending.status === 'Draft' ? 'Draft' : 'In review' })
			.click()
	const version = detail(page, 'ef-hcm-job-catalogue-version')
	const lifecycle = page.locator('ef-hcm-job-catalogue-lifecycle-dialog')
	if (pending?.status !== 'InReview') {
		await expect(version).toContainText('Draft')
		await extendAndSubmit(page)
	}
	await page.getByRole('button', { name: 'Publish' }).click()
	const date = nextDate(current?.effectiveFrom ?? '2000-01-01')
	const picker = lifecycle.locator('ui5-date-picker').locator('input')
	await picker.fill(medium(date))
	await picker.press('Enter')
	await lifecycle.getByRole('textbox', { name: 'Reason for change' }).fill('Approved')
	await lifecycle.getByRole('button', { name: 'Publish' }).click()
	await expect(lifecycle).toHaveCount(0)
	await expect(version).toContainText('Published (current)')
	const after = await catalogue(page)
	expect(after.currentVersionId).toBe(pending?.id)
	expect(after.versions.find(/** Previous. */ (v) => v.id === current?.id)?.status).toBe(
		'Superseded',
	)
	expect(await violations(page)).toEqual([])
})

test('creates a job profile on its own page and publishes it', /** REQ-JOB-CATALOGUE-003, REQ-JOB-CATALOGUE-006. */ async ({
	page,
}) => {
	await open(page, 'David Wallace')
	await page.getByRole('option', { name: 'Job profiles' }).click()
	await page.getByRole('button', { name: 'New job profile' }).click()
	await expect(page).toHaveURL(/\/job-catalogue\/profiles\/new$/)
	const code = `CLERK_${randomUUID().slice(0, 6).toUpperCase().replace(/-/g, '')}`
	const editor = page.locator('ef-hcm-job-profile-editor')
	await editor.getByRole('textbox', { name: 'Code', exact: true }).fill(code)
	await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Order Clerk')
	await editor.getByRole('combobox', { name: 'Job family' }).click()
	await page.getByRole('option', { name: '— Inside Sales' }).click()
	await editor.getByRole('combobox', { name: 'Career track' }).click()
	await page.getByRole('option', { name: 'Individual Contributor' }).click()
	await editor.getByRole('combobox', { name: 'Level' }).click()
	await page.getByRole('option', { name: 'Associate (IC1)' }).click()
	const grades = editor.getByRole('combobox', { name: 'Allowed grades' })
	await grades.fill('G1')
	await page.getByRole('option', { name: /G1 · Grade 1/ }).click()
	await grades.press('Escape')
	await editor.getByRole('combobox', { name: 'Default grade' }).click()
	await page.getByRole('option', { name: 'G1 · Grade 1' }).last().click()
	await page.getByRole('button', { name: 'Add responsibility' }).click()
	await editor.getByRole('textbox', { name: 'Responsibility 1 code' }).fill('ORDERS')
	await editor
		.getByRole('textbox', { name: 'Responsibility 1 statement' })
		.fill('Process inbound orders.')
	await editor.getByRole('textbox', { name: 'Reason for change' }).fill('New role')
	expect(await violations(page, 'ef-hcm-job-profile-editor')).toEqual([])
	await page.getByRole('button', { name: 'Create profile' }).click()
	await expect(page).toHaveURL(/\/job-catalogue\/profiles\/job-profile/)
	const profile = detail(page, 'ef-hcm-job-profile-version')
	await expect(profile).toContainText('Order Clerk')
	await expect(profile).toContainText('Draft')

	await page.getByRole('button', { name: 'Edit draft' }).click()
	await expect(page).toHaveURL(/\/edit$/)
	await editor.getByRole('textbox', { name: 'Summary' }).fill('Handles inbound orders.')
	await page.getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing' }).click()
	await editor.getByRole('textbox', { name: 'Reason for change' }).fill('Summary added')
	await page.getByRole('button', { name: 'Save draft' }).click()
	await expect(profile).toContainText('Handles inbound orders.')

	await page.getByRole('button', { name: 'Submit for review' }).click()
	const lifecycle = page.locator('ef-hcm-job-catalogue-lifecycle-dialog')
	await lifecycle.getByRole('textbox', { name: 'Reason for change' }).fill('Ready')
	await lifecycle.getByRole('button', { name: 'Submit' }).click()
	await expect(profile).toContainText('In review')
	await page.getByRole('button', { name: 'Publish' }).click()
	await lifecycle.getByRole('textbox', { name: 'Reason for change' }).fill('Approved')
	await lifecycle.getByRole('button', { name: 'Publish' }).click()
	await expect(profile).toContainText('Published (current)')
})

test('stays usable at supported widths', /** REQ-JOB-CATALOGUE-006. */ async ({ page }) => {
	await open(page, 'Toby Flenderson')
	await rows(page, 'Catalogue versions').filter({ hasText: '(current)' }).click()
	for (const width of [390, 768, 1440, 2560]) {
		await page.setViewportSize({ width, height: 1000 })
		await expect(detail(page, 'ef-hcm-job-catalogue-version')).toContainText('Catalogue version')
		expect(
			await page.evaluate(
				/** Detect viewport overflow outside native popins. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
		expect(await violations(page)).toEqual([])
	}
})
