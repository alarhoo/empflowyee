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
async function violations(page: Page, host = 'ef-hcm-positions'): Promise<string[]> {
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

/** Switch persona through the real Settings dialog and open Positions from catalogue search. */
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('POSITIONS')
	await page
		.getByRole('button', { name: /^Positions/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/job-architecture\/positions$/)
	await expect(page.getByRole('grid', { name: 'Positions' })).toBeVisible()
}

/** Rows of a named table in the feature. */
function rows(page: Page, table: string) {
	return page.locator(`ui5-table[accessible-name="${table}"] ui5-table-row[row-key]`)
}

/** Choose one server-filtered option by typing part of its name, after the search settles. */
async function pick(page: Page, label: string, text: string): Promise<void> {
	const host = page.locator(`ef-hcm-position-editor ui5-combobox[accessible-name="${label}"]`)
	await host.getByRole('combobox', { name: label, exact: true }).fill(text)
	await page.waitForTimeout(300)
	await expect(host).not.toHaveAttribute('loading', /.*/)
	await page
		.getByRole('option', { name: new RegExp(text) })
		.first()
		.click()
	await expect
		.poll(
			/** The selection is an identity, not just text. */ () =>
				host.evaluate(
					/** The ComboBox's selected identity. */ (element) =>
						(element as unknown as { selectedValue: string }).selectedValue,
				),
		)
		.not.toBe('')
	await host.getByRole('combobox', { name: label, exact: true }).press('Tab')
}

/** Run an Object Page action, opening the toolbar overflow when the column is narrow. */
async function act(page: Page, host: string, name: string): Promise<void> {
	const scope = page.locator(host)
	const button = scope.getByRole('button', { name, exact: true })
	if (!(await button.isVisible())) {
		await scope.getByRole('button', { name: 'Additional Options' }).click()
		await page.locator('ui5-toolbar-button, ui5-button').filter({ hasText: name }).last().click()
		return
	}
	await button.click()
}

/** An ISO date some days from today, in the DatePicker's medium display format. */
function mediumDaysAhead(days: number): string {
	const date = new Date()
	date.setUTCDate(date.getUTCDate() + days)
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	})
}

/** Withdraw any open request on a seeded position left by an earlier run, as its requester. */
async function settle(page: Page): Promise<void> {
	const headers = { host: 'acme.localhost', 'x-hcm-development-persona': 'toby' }
	const base = 'http://127.0.0.1:4402/api/v1/job-architecture'
	const list = await page.request.get(`${base}/position-change-requests?view=mine&limit=100`, {
		headers,
	})
	for (const request of (await list.json()).items as {
		id: string
		status: string
		revision: number
	}[])
		if (['Draft', 'Previewed', 'PendingApproval'].includes(request.status))
			await page.request.post(
				`${base}/position-change-requests/${encodeURIComponent(request.id)}/withdraw`,
				{
					headers: {
						...headers,
						origin: 'http://acme.localhost:4302',
						'content-type': 'application/json',
						'idempotency-key': randomUUID(),
					},
					data: { expectedRevision: request.revision, reason: 'Browser acceptance reset' },
				},
			)
}

test('shows positions with occupancy and remaining capacity', /** REQ-POSITIONS-001, REQ-POSITIONS-007. */ async ({
	page,
}) => {
	await open(page, 'Toby Flenderson')
	const sales = rows(page, 'Positions').filter({ hasText: 'SCR-SALES-REP' }).first()
	await expect(sales).toContainText('2 seats, 2 FTE')
	await expect(sales).toContainText('1 people, 1 FTE')
	await expect(sales).toContainText('1 seats, 1 FTE')
	await page.getByRole('combobox', { name: 'Vacancy' }).click()
	await page.getByRole('option', { name: 'With vacancy' }).click()
	await page.getByRole('button', { name: 'Apply filters' }).click()
	await expect(rows(page, 'Positions').filter({ hasText: 'SCR-ASST-RM' })).toHaveCount(0)
	await expect(rows(page, 'Positions').filter({ hasText: 'SCR-SALES-REP' })).toHaveCount(1)
	await rows(page, 'Positions').filter({ hasText: 'SCR-SALES-REP' }).first().click()
	await expect(page).toHaveURL(/positions\/dunder-mifflin%2Fposition%2FSCR-SALES-REP$/)
	const position = page.locator('ef-hcm-position')
	await position.getByRole('tab', { name: 'Capacity and incumbents' }).click()
	await expect(rows(page, 'Incumbents')).toContainText(['Jim Halpert'])
	await position.getByRole('tab', { name: 'Relationships' }).click()
	await expect(rows(page, 'Relationships')).toContainText(['Regional Manager, Scranton'])
	expect(await violations(page)).toEqual([])
})

test('requests a new position, previews and submits it, and an independent approver applies it', /** REQ-POSITIONS-002 to REQ-POSITIONS-004. */ async ({
	page,
}) => {
	await settle(page)
	await open(page, 'Toby Flenderson')
	await page.getByRole('button', { name: 'New position' }).click()
	await expect(page).toHaveURL(/positions\/new$/)
	const editor = page.locator('ef-hcm-position-editor')
	const code = `SCR-QA-${randomUUID().slice(0, 6).toUpperCase()}`
	await editor.getByRole('textbox', { name: 'Code' }).fill(code)
	await editor
		.getByRole('textbox', { name: 'Name', exact: true })
		.fill('Quality Assurance, Scranton')
	await pick(page, 'Job profile', 'Sales Representative')
	await expect(editor.getByRole('combobox', { name: 'Grade' })).toContainText('default')
	await pick(page, 'Designation', 'Sales Representative')
	await pick(page, 'Legal entity', 'Dunder Mifflin')
	await pick(page, 'Unit', 'Scranton')
	await pick(page, 'Location', 'Scranton')
	await pick(page, 'Reports to', 'Regional Manager')
	// FTE above headcount is refused before anything is sent.
	await editor.getByRole('textbox', { name: 'FTE capacity' }).fill('2')
	await editor.getByRole('textbox', { name: 'FTE capacity' }).press('Tab')
	const effective = editor.locator('ui5-date-picker').locator('input')
	await effective.fill(mediumDaysAhead(7))
	await effective.press('Enter')
	await editor.getByRole('textbox', { name: 'Reason for change' }).fill('Quality checks for paper')
	await editor.getByRole('button', { name: 'Save as draft request' }).click()
	await expect(page).toHaveURL(/positions\/new$/)
	await editor.getByRole('textbox', { name: 'FTE capacity' }).fill('1')
	await editor.getByRole('textbox', { name: 'FTE capacity' }).press('Tab')
	expect(await violations(page, 'ef-hcm-position-editor')).toEqual([])
	await editor.getByRole('button', { name: 'Save as draft request' }).click()
	await expect(page).toHaveURL(/\/requests\//)
	const request = page.locator('ef-hcm-position-request')
	await expect(request.getByText('Quality checks for paper')).toBeVisible()
	await act(page, 'ef-hcm-position-request', 'Preview impact')
	await expect(page.getByText('Impact previewed.')).toBeVisible()
	await act(page, 'ef-hcm-position-request', 'Submit')
	await expect(page.getByText('Request submitted for approval.')).toBeVisible()
	await expect(request.locator('[hcmHeader], span[fd-object-status]').first()).toContainText(
		'Pending approval',
	)
	// The requester has no decision actions.
	await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)

	await open(page, 'David Wallace')
	await page.getByRole('option', { name: 'Change requests' }).click()
	await page.getByRole('combobox', { name: 'Requests' }).click()
	await page.getByRole('option', { name: 'Awaiting my decision' }).click()
	await page.getByRole('button', { name: 'Apply filters' }).click()
	await rows(page, 'Change requests').filter({ hasText: code }).first().click()
	await expect(request.getByText('Quality checks for paper')).toBeVisible()
	expect(await violations(page)).toEqual([])
	await act(page, 'ef-hcm-position-request', 'Reject')
	const dialog = page.locator('ef-hcm-position-request-dialog')
	await dialog.getByRole('button', { name: 'Reject' }).click()
	await expect(dialog.getByRole('textbox', { name: 'Decision comment' })).toBeFocused()
	await dialog.getByRole('button', { name: 'Cancel' }).click()
	await act(page, 'ef-hcm-position-request', 'Approve')
	await dialog.getByRole('textbox', { name: 'Decision comment' }).fill('Approved for Q4')
	await dialog.getByRole('button', { name: 'Approve' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText('New position request approved and applied.')).toBeVisible()
	await request.getByRole('tab', { name: 'Decision' }).click()
	await expect(request.getByText('Approved for Q4')).toBeVisible()
	const position = page.locator('ef-hcm-position')
	await expect(position.getByText('Open', { exact: true }).first()).toBeVisible()
})

test('freezes a position through a dialog without ending assignments', /** REQ-POSITIONS-003. */ async ({
	page,
}) => {
	await settle(page)
	await open(page, 'Toby Flenderson')
	await rows(page, 'Positions').filter({ hasText: 'SCR-SENIOR-ACCT' }).first().click()
	await act(page, 'ef-hcm-position', 'Freeze')
	const dialog = page.locator('ef-hcm-position-request-dialog')
	await expect(dialog.getByText('Current assignments are not changed.')).toBeVisible()
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Hiring pause')
	await dialog.getByRole('button', { name: 'Raise request' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page).toHaveURL(/\/requests\//)
	const request = page.locator('ef-hcm-position-request')
	await request.getByRole('tab', { name: 'Proposed changes' }).click()
	await expect(rows(page, 'Proposed changes')).toContainText(['Status: Open → Frozen'])
	// A second request is not offered while this one is open.
	await expect(page.locator('ef-hcm-position').getByRole('button', { name: 'Freeze' })).toHaveCount(
		0,
	)
	await act(page, 'ef-hcm-position-request', 'Withdraw')
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Pause cancelled')
	await dialog.getByRole('button', { name: 'Withdraw' }).click()
	await expect(page.getByText('Freeze request withdrawn.')).toBeVisible()
})

test('shows no request controls to readers without the request grant', /** REQ-POSITIONS-006. */ async ({
	page,
}) => {
	await open(page, 'David Wallace')
	await expect(page.getByRole('button', { name: 'New position' })).toHaveCount(0)
	await rows(page, 'Positions').filter({ hasText: 'SCR-HR-REP' }).first().click()
	await expect(
		page.locator('ef-hcm-position').getByRole('button', { name: 'Request change' }),
	).toHaveCount(0)
	await page.goto('/job-architecture/positions/new')
	await expect(page.getByText(/permission|access/i).first()).toBeVisible()
})
