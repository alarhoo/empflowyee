import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openTypes(page: Page): Promise<void> {
	page.on(
		'pageerror',
		/** Surface native/component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Toby Flenderson', exact: false }).click()
	await expect(page.getByRole('button', { name: 'Toby Flenderson', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('DOCUMENT_TYPES')
	await page.getByRole('button', { name: 'Document Types — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Document types', exact: true })).toBeVisible()
}
/** Send acceptance reads through the real local runtime contract. */
function headers() {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': 'toby',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}
const api = 'http://127.0.0.1:4402/api/v1/documents/types'

/** Open the native page action through its maintained narrow-screen overflow when needed. */
async function createType(page: Page): Promise<void> {
	const button = page.getByRole('button', { name: 'Create document type', exact: true })
	if (!(await button.isVisible()))
		await page
			.locator('ef-hcm-document-types')
			.getByRole('button', { name: 'Additional Options', exact: true })
			.click()
	await button.click()
}
test('creates, retries and edits a persisted classification through native focused forms', /** Leave an honestly created disabled acceptance classification with its audit history. */ async ({
	page,
	context,
}) => {
	test.setTimeout(180000)
	await openTypes(page)
	const view = page.locator('ef-hcm-document-types'),
		label = 'Browser document type ' + Date.now(),
		code = 'E2E_TYPE_' + Date.now()
	await view.getByRole('button', { name: 'Create document type', exact: true }).click()
	const dialog = page.locator('ef-hcm-document-type-dialog')
	await dialog.getByRole('textbox', { name: 'Code', exact: true }).fill(code)
	await dialog.getByRole('textbox', { name: 'Label', exact: true }).fill(label)
	await dialog
		.getByRole('textbox', { name: 'Description', exact: true })
		.fill('Local browser acceptance classification')
	await dialog
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Verify real classification create')
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-document-type-dialog').analyze()).violations,
	).toEqual([])
	await context.setOffline(true)
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog.getByRole('note', { name: /could not be completed/ })).toBeVisible()
	await context.setOffline(false)
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await view.getByRole('textbox', { name: 'Search code or label', exact: true }).fill(code)
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('button', { name: 'Edit ' + label, exact: true })).toBeVisible()
	const response = await page.request.get(api + '?q=' + code, { headers: headers() })
	expect(response.status()).toBe(200)
	const before = (await response.json()).items[0]
	expect(before.code).toBe(code)
	await view.getByRole('button', { name: 'Edit ' + label, exact: true }).click()
	await expect(dialog.getByRole('textbox', { name: 'Code', exact: true })).toHaveCount(0)
	await dialog.getByRole('checkbox', { name: 'Enabled for new documents', exact: true }).click()
	await dialog
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Disable acceptance classification after verification')
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	const saved = (await (await page.request.get(api + '?q=' + code, { headers: headers() })).json())
		.items[0]
	expect(saved.enabled).toBe(false)
	expect(saved.revision).toBe(before.revision + 1)
	await view.getByRole('button', { name: 'Edit ' + label, exact: true }).click()
	await dialog.getByRole('textbox', { name: 'Label', exact: true }).fill('Unsaved change')
	// UI5 Input owns Escape to revert its active value; focus the action to test dialog dismissal.
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus()
	await page.keyboard.press('Escape')
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(dialog.getByRole('textbox', { name: 'Label', exact: true })).toHaveValue(
		'Unsaved change',
	)
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'Toby Flenderson', exact: true })
		.click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'David Wallace', exact: false }).click()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('DOCUMENT_TYPES')
	await page.getByRole('button', { name: 'Document Types — Available', exact: true }).click()
	await expect(
		page.getByRole('heading', { name: 'Permission required', exact: true }),
	).toBeVisible()
	await expect(page.getByRole('grid', { name: 'Document types', exact: true })).toHaveCount(0)
})
test('keeps classification list and create form accessible in four themes', /** Native responsive tables and dialogs remain usable without feature styling. */ async ({
	page,
}) => {
	test.setTimeout(600000)
	await openTypes(page)
	for (const [variant, label] of [
		['horizon-light', 'Horizon Light'],
		['horizon-dark', 'Horizon Dark'],
		['her-light', 'HER Light'],
		['her-dark', 'HER Dark'],
	]) {
		await selectAppearance(page, label)
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-document-types').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Check page-wide horizontal overflow. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await createType(page)
			await expect(page.getByRole('textbox', { name: 'Reason', exact: true })).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-document-type-dialog').analyze())
					.violations,
			).toEqual([])
			await page
				.locator('ef-hcm-document-type-dialog')
				.getByRole('button', { name: 'Cancel', exact: true })
				.click()
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.screenshot({ path: `.tmp/hcm-document-types/${variant}.png`, fullPage: true })
	}
})

test('applies and removes persisted tenant branding on the real classification screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
	page,
}) => {
	const config = JSON.parse(readFileSync('.local/hcm/database.json', 'utf8'))
	const database = new Client({
		host: '127.0.0.1',
		port: config.port,
		database: 'hcm_db',
		user: 'hcm_migrator',
		password: config.migratorPassword,
	})
	await database.connect()
	await database.query("SELECT set_config('hcm.tenant_id','local-dunder-mifflin',false)")
	const original = (
		await database.query("SELECT primary_color FROM hcm.tenant WHERE id='local-dunder-mifflin'")
	).rows[0].primary_color
	try {
		await database.query("UPDATE hcm.tenant SET primary_color=$1 WHERE id='local-dunder-mifflin'", [
			'#285a8d',
		])
		await openTypes(page)
		await expect
			.poll(
				/** Read the actual semantic overlay applied by the shared theme service. */ () =>
					page
						.locator('html')
						.evaluate(
							/** Inspect the public semantic accent parameter. */ (element) =>
								element.style.getPropertyValue('--ef-color-accent'),
						),
			)
			.toBe('#285a8d')
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-document-types').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openTypes(page)
		await expect
			.poll(
				/** Confirm obsolete tenant styling was removed after a fresh runtime bootstrap. */ () =>
					page
						.locator('html')
						.evaluate(
							/** Inspect only the public overlay slot. */ (element) =>
								element.style.getPropertyValue('--ef-color-accent'),
						),
			)
			.toBe('')
	} finally {
		await database.query("UPDATE hcm.tenant SET primary_color=$1 WHERE id='local-dunder-mifflin'", [
			original,
		])
		await database.end()
	}
})
