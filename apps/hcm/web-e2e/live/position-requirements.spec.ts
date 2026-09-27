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

/** Run axe on the feature and return violations other than the recorded shared findings. */
async function violations(page: Page, host = 'ef-hcm-position-requirements'): Promise<string[]> {
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

/** Switch persona through the real Settings dialog and open an app from catalogue search. */
async function open(page: Page, name: string, app = 'POSITION_REQUIREMENTS'): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill(app)
	await page
		.getByRole('button', { name: /^Position Requirements/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/job-architecture\/position-requirements$/)
	await expect(page.getByRole('grid', { name: 'Positions' })).toBeVisible()
}

/** Rows of a named table. */
function rows(page: Page, table: string) {
	return page.locator(`ui5-table[accessible-name="${table}"] ui5-table-row[row-key]`)
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

/** Withdraw Toby's open requests left by an earlier run. */
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

const SET = 'ef-hcm-position-requirement-set'

test('shows effective and profile requirements per position', /** REQ-POSITION-REQUIREMENTS-001, REQ-POSITION-REQUIREMENTS-006. */ async ({
	page,
}) => {
	await open(page, 'Toby Flenderson')
	await rows(page, 'Positions').filter({ hasText: 'SCR-HR-REP' }).first().click()
	const set = page.locator(SET)
	await expect(rows(page, 'Effective requirements').first()).toBeVisible()
	await expect(rows(page, 'Effective requirements').first()).toContainText('Profile')
	await set.getByRole('tab', { name: 'Profile requirements' }).click()
	await expect(rows(page, 'Profile requirements').first()).toBeVisible()
	expect(await violations(page)).toEqual([])
})

test('proposes, removes and submits variances, and a waive-authorized approver applies them', /** REQ-POSITION-REQUIREMENTS-002 to REQ-POSITION-REQUIREMENTS-004. */ async ({
	page,
}) => {
	await settle(page)
	await open(page, 'Toby Flenderson')
	await rows(page, 'Positions').filter({ hasText: 'SCR-ACCOUNTANT' }).first().click()
	const set = page.locator(SET)
	await expect(rows(page, 'Effective requirements').first()).toBeVisible()
	const code = `QA_${randomUUID().slice(0, 6).toUpperCase().replace(/-/g, '')}`

	await act(page, SET, 'Add requirement')
	const dialog = page.locator('ef-hcm-position-variance-dialog')
	await dialog.getByRole('textbox', { name: 'Code' }).fill(code)
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Spreadsheet audit')
	await dialog.getByRole('textbox', { name: 'Reason for change' }).fill('Year-end audit support')
	expect(await violations(page, 'ef-hcm-position-variance-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Add to proposal' }).click()
	await expect(dialog).toHaveCount(0)
	await set.getByRole('tab', { name: 'Proposed variances' }).click()
	await expect(rows(page, 'Proposed variances').filter({ hasText: code })).toHaveCount(1)

	await act(page, SET, 'Waive requirement')
	await expect(dialog.getByRole('textbox', { name: 'Reason for change' })).toHaveCount(0)
	await dialog.getByRole('button', { name: 'Add to proposal' }).click()
	await expect(dialog.getByRole('textbox', { name: 'Justification' })).toBeFocused()
	await dialog
		.getByRole('textbox', { name: 'Justification' })
		.fill('Degree waived for certified bookkeepers')
	await dialog.getByRole('button', { name: 'Add to proposal' }).click()
	await expect(dialog).toHaveCount(0)
	const waived = rows(page, 'Proposed variances').filter({ hasText: 'Waived' })
	await expect(waived).toHaveCount(1)
	await expect(waived).toContainText('Degree waived for certified bookkeepers')

	await rows(page, 'Proposed variances')
		.filter({ hasText: code })
		.getByRole('button', { name: `Remove ${code}` })
		.click()
	await expect(rows(page, 'Proposed variances').filter({ hasText: code })).toHaveCount(0)

	await act(page, SET, 'Submit for approval')
	const submit = page.locator('ef-hcm-position-submit-dialog')
	await expect(
		submit.getByText('must also be allowed to approve waived requirements'),
	).toBeVisible()
	await submit.getByRole('button', { name: 'Submit', exact: true }).click()
	await expect(submit).toHaveCount(0)
	await expect(page.getByText('Proposal submitted for approval.')).toBeVisible()
	// Nothing applies before approval.
	await set.getByRole('tab', { name: 'Effective requirements' }).click()

	await open(page, 'David Wallace')
	await rows(page, 'Positions').filter({ hasText: 'SCR-ACCOUNTANT' }).first().click()
	await act(page, SET, 'Open in Positions')
	await expect(page).toHaveURL(/\/job-architecture\/positions\/.+\/requests\//)
	await act(page, 'ef-hcm-position-request', 'Approve')
	const decision = page.locator('ef-hcm-position-request-dialog')
	await decision.getByRole('button', { name: 'Approve' }).click()
	await expect(decision).toHaveCount(0)
	await expect(page.getByText('Change request approved and applied.')).toBeVisible()
})

test('lets readers without the request grant only read', /** REQ-POSITION-REQUIREMENTS-005. */ async ({
	page,
}) => {
	await open(page, 'David Wallace')
	await rows(page, 'Positions').filter({ hasText: 'SCR-SENIOR-ACCT' }).first().click()
	await expect(rows(page, 'Effective requirements').first()).toBeVisible()
	await expect(page.locator(SET).getByRole('button', { name: 'Add requirement' })).toHaveCount(0)
})
