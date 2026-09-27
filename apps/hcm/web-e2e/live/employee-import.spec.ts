import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ actionTimeout: 20000 })

/** Shared findings recorded outside this app: Display Form definition lists and ObjectStatus contrast. */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']
const HEADER =
	'First name,Last name,Worker number,Work email,Legal entity,Hire date,Unit,Department,Designation,Location,Manager'

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

/** Switch persona through the real Settings dialog and open Employee Import from catalogue search. */
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('EMPLOYEE_IMPORT')
	await page
		.getByRole('button', { name: /^Employee Import/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/employee-import$/)
	await expect(page.getByRole('grid', { name: 'Import runs' })).toBeVisible()
}

/** Choose an option of a native Select by its visible text. */
async function choose(
	page: Page,
	scope: string,
	label: string,
	option: string | RegExp,
): Promise<void> {
	await page.locator(scope).getByRole('combobox', { name: label, exact: true }).click()
	await page.getByRole('option', { name: option }).first().click()
}

/** Move the wizard forward from the current step. */
async function nextStep(page: Page): Promise<void> {
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Next step' }).click()
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

test('imports new hires through the wizard, resolving a match before commit', /** REQ-EMPLOYEE-IMPORT-002 to -006. */ async ({
	page,
}) => {
	const stamp = Date.now().toString(36).toUpperCase().slice(-6)
	const csv = [
		HEADER,
		`Erin,Hannon${stamp},DM-E${stamp},erin.${stamp.toLowerCase()}@dundermifflin.example,DMPC,2026-02-01,scranton,RECEPTION,ACCOUNTANT,SCR-01,DM-MICHAEL`,
		`Jim,Twin${stamp},DM-J${stamp},jim.halpert@dundermifflin.example,DMPC,2026-02-01,scranton,,ACCOUNTANT,SCR-01,`,
		`Bad,Row${stamp},DM-B${stamp},,DMPC,02/01/2026,scranton,,ACCOUNTANT,NOWHERE,`,
	].join('\n')
	await open(page)
	await page.getByRole('button', { name: 'New run' }).click()
	await expect(page).toHaveURL(/\/employee\/employee-import\/runs\/new$/)
	const wizard = 'ef-hcm-import-run-wizard'
	// The template is required before the upload step unlocks.
	await nextStep(page)
	await expect(page.locator(wizard).getByText('Choose a template.', { exact: true })).toBeVisible()
	await choose(page, wizard, 'Template', /New hires \(NEW_HIRES\)/)
	await choose(page, wizard, 'Action', 'Create new workers')
	await nextStep(page)
	await page
		.locator(wizard)
		.locator('input[type=file]')
		.setInputFiles({ name: `hires-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
	await nextStep(page)
	await expect(page.locator(wizard).getByText('Next validates every row.')).toBeVisible()
	expect(await violations(page, wizard)).toEqual([])
	await nextStep(page)
	// Validation found one matched row: commit stays locked until it is resolved.
	const matches = page
		.locator(wizard)
		.locator('ui5-table[accessible-name="Matched rows"] ui5-table-row[row-key]')
	await expect(matches).toHaveCount(1)
	await expect(matches.first()).toContainText('Jim Halpert')
	await nextStep(page)
	await expect(
		page.locator(wizard).getByText('1 matched rows still need a resolution.').first(),
	).toBeVisible()
	await page.getByRole('button', { name: 'Resolve row 3' }).click()
	const dialog = page.locator('ef-hcm-import-resolve-dialog')
	await choose(page, 'ef-hcm-import-resolve-dialog', 'Resolution', 'Skip this row')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('Same person as Jim Halpert')
	expect(await violations(page, 'ef-hcm-import-resolve-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Resolve', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(matches.first()).toContainText('Skip this row')
	await nextStep(page)
	await page.locator('ef-hcm-wizard-page').getByRole('button', { name: 'Commit rows' }).click()

	// The committed run opens with its outcome; invalid rows name fields and codes, not values.
	await expect(page).toHaveURL(/\/employee\/employee-import\/runs\/[^/]+$/)
	const run = page.locator('ef-hcm-import-run')
	await expect(run.getByText('Completed with errors').first()).toBeVisible()
	await expect(run.getByText('1 committed, 0 failed, 1 skipped')).toBeVisible()
	await expect(run).not.toContainText('NOWHERE')
	await expect(run).toContainText('Location: No active record has this code.')
	expect(await violations(page, 'ef-hcm-employee-import')).toEqual([])
	const download = page.waitForEvent('download')
	await act(page, 'ef-hcm-import-run', 'Download issue report')
	expect((await download).suggestedFilename()).toMatch(/^import-issues-.+\.csv$/)
})

test('drafts, publishes and versions a template', /** REQ-EMPLOYEE-IMPORT-001. */ async ({
	page,
}) => {
	const code = `BROWSER_${Date.now().toString(36).toUpperCase().slice(-6)}`
	await open(page)
	await page
		.getByRole('radio', { name: 'Templates' })
		.or(page.getByRole('option', { name: 'Templates' }))
		.first()
		.click()
	await expect(page.getByRole('grid', { name: 'Import templates' })).toBeVisible()
	await page.getByRole('button', { name: 'New template' }).click()
	await expect(page).toHaveURL(/\/employee\/employee-import\/templates\/new$/)
	const editor = page.locator('ef-hcm-import-template-editor')
	await editor.getByRole('textbox', { name: 'Code' }).fill(code)
	await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser name fixes')
	await editor.getByRole('textbox', { name: 'Column 1 source name' }).fill('Number')
	const field = editor.getByRole('combobox', { name: 'Column 1 field' })
	await field.fill('Worker number')
	await field.press('Enter')
	await editor.getByRole('checkbox', { name: 'Column 1 match key' }).click()
	await editor.getByRole('button', { name: 'Add column' }).click()
	await editor.getByRole('textbox', { name: 'Column 2 source name' }).fill('Preferred')
	const second = editor.getByRole('combobox', { name: 'Column 2 field' })
	await second.fill('Preferred name')
	await second.press('Enter')
	await editor.getByRole('textbox', { name: 'Reason' }).fill('Bulk preferred name corrections')
	expect(await violations(page, 'ef-hcm-import-template-editor')).toEqual([])
	await editor.getByRole('button', { name: 'Create template' }).click()

	const template = page.locator('ef-hcm-import-template')
	await expect(page).toHaveURL(/\/employee\/employee-import\/templates\/(?!new$)[^/]+$/)
	await expect(template.getByText('Draft').first()).toBeVisible()
	await act(page, 'ef-hcm-import-template', 'Publish')
	const dialog = page.locator('ef-hcm-import-dialog')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('Ready for HR')
	await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
	await expect(page.getByText('The template version was published.')).toBeVisible()
	await expect(template.getByRole('button', { name: 'Edit draft' })).toHaveCount(0)
	await act(page, 'ef-hcm-import-template', 'New version')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('Add middle names')
	await dialog.getByRole('button', { name: 'Create version', exact: true }).click()
	await expect(page).toHaveURL(/\/templates\/[^/]+\/edit$/)
	await expect(page.locator('ef-hcm-import-template-editor')).toContainText('version 2')
})

test('keeps Employee Import out of reach for an employee', /** REQ-EMPLOYEE-IMPORT-007. */ async ({
	page,
}) => {
	await page.goto('/employee/employee-import')
	await expect(page.getByRole('grid', { name: 'Import runs' })).toHaveCount(0)
})
