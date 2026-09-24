import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openDocuments(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('EMPLOYEE_DOCUMENTS')
	await page.getByRole('button', { name: 'Employee Documents — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Employee documents', exact: true })).toBeVisible()
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
const api = 'http://127.0.0.1:4402/api/v1/documents'

/** Open the native page action through its maintained narrow-screen overflow when needed. */
async function createDocument(page: Page): Promise<void> {
	const button = page.getByRole('button', { name: 'Upload employee document', exact: true }),
		overflow = page
			.locator('ef-hcm-employee-documents')
			.getByRole('button', { name: 'Additional Options', exact: true })
	await expect(
		/** Follow a toolbar while FCL resize moves its action into or out of overflow. */ async () => {
			if (await button.isVisible()) return
			await overflow.click({ timeout: 500 })
		},
	).toPass({ timeout: 15000 })
	await button.click()
}
/** Use the maintained Object Page toolbar overflow on narrow screens. */
async function detailAction(page: Page, name: string): Promise<void> {
	const action = page.getByRole('button', { name, exact: true })
	if (!(await action.isVisible()))
		await page
			.locator('ef-hcm-object-page')
			.getByRole('button', { name: 'Additional Options', exact: true })
			.click()
	await action.click()
}
/** Follow maintained routed-page action overflow on narrow screens. */
async function cancelUpload(page: Page): Promise<void> {
	const screen = page.locator('ef-hcm-worker-upload'),
		button = screen.getByRole('button', { name: 'Cancel', exact: true })
	if (!(await button.isVisible()))
		await screen.getByRole('button', { name: 'Additional Options', exact: true }).click()
	await button.click()
}
test('uploads worker documents on a routed page and changes sharing per version', /** Use actual HR authority, private files and audit; no frontend fixtures. */ async ({
	page,
	context,
}) => {
	test.setTimeout(180000)
	const label = 'Browser reference ' + Date.now(),
		code = 'BROWSER_REF_' + Date.now()
	const typeResponse = await page.request.post(api + '/types', {
		headers: headers(),
		data: { code, label: 'Browser reference type', reason: 'Validate real template upload' },
	})
	expect(typeResponse.status()).toBe(201)
	await openDocuments(page)
	await createDocument(page)
	const dialog = page.locator('ef-hcm-worker-upload')
	await expect(page).toHaveURL(/employee-documents\/create/)
	await dialog.getByRole('combobox', { name: 'Worker', exact: true }).click()
	await page.getByRole('option', { name: /Jim Halpert/ }).click()
	await dialog.getByRole('textbox', { name: 'Find document type', exact: true }).fill(code)
	await dialog.getByRole('button', { name: 'Find types', exact: true }).click()
	await dialog.getByRole('combobox', { name: 'Document type', exact: true }).click()
	await page.getByRole('option', { name: `Browser reference type (${code})`, exact: true }).click()
	await dialog.getByRole('textbox', { name: 'Label', exact: true }).fill(label)
	await dialog.locator('input[type=file]').setInputFiles({
		name: 'reference.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from('%PDF-1.7\nBrowser reference one\n%%EOF'),
	})
	await dialog
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Verify persistent reference and download')
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-worker-upload').analyze()).violations,
	).toEqual([])
	await context.setOffline(true)
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog.getByRole('note', { name: /could not be completed/ })).toBeVisible()
	await context.setOffline(false)
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
	await expect(page).toHaveURL(/document=/)
	await page.getByRole('tab', { name: 'Versions', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Download version 1', exact: true })).toBeVisible()
	const downloadPromise = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Download version 1', exact: true }).click()
	const download = await downloadPromise
	expect(download.suggestedFilename()).toBe('reference.pdf')
	expect(await download.failure()).toBeNull()
	await page.getByRole('button', { name: 'Change sharing for version 1', exact: true }).click()
	const sharing = page.locator('ef-hcm-worker-share-dialog')
	await sharing
		.getByRole('checkbox', { name: 'Share this version with employee', exact: true })
		.check()
	await sharing
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Explicitly share only this version')
	await sharing.getByRole('button', { name: 'Save sharing', exact: true }).click()
	await expect(sharing).toHaveCount(0)
	await expect(
		page.getByRole('row', { name: /1 reference.pdf Shared with employee/ }),
	).toBeVisible()

	await detailAction(page, 'Upload new version')
	await expect(dialog.getByRole('textbox', { name: 'Label', exact: true })).toHaveCount(0)
	await dialog.locator('input[type=file]').setInputFiles({
		name: 'reference-v2.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from('%PDF-1.7\nBrowser reference two\n%%EOF'),
	})
	await dialog
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Keep both immutable versions')
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await page.getByRole('tab', { name: 'Versions', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Download version 2', exact: true })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Download version 1', exact: true })).toBeVisible()
	await detailAction(page, 'Back to documents')
	await page
		.getByRole('row')
		.filter({ hasText: '' + label })
		.first()
		.click()
	await page.getByRole('tab', { name: 'Versions', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Download version 2', exact: true })).toBeVisible()
})
test('keeps employee document list, Object Page and focused upload accessible across themes and widths', /** Exercise production native floorplans at desktop, tablet and narrow widths. */ async ({
	page,
}) => {
	test.setTimeout(600000)
	await openDocuments(page)
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
				(await new AxeBuilder({ page }).include('ef-hcm-employee-documents').analyze()).violations,
			).toEqual([])
			await page
				.getByRole('row')
				.filter({ hasText: /^Browser reference / })
				.first()
				.click()
			await page.getByRole('tab', { name: 'Versions', exact: true }).click()
			await expect(
				page.getByRole('button', { name: 'Download version 1', exact: true }),
			).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-employee-documents').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Native FCL must not force outer horizontal scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await detailAction(page, 'Upload new version')
			await expect(page.getByRole('textbox', { name: 'Reason', exact: true })).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-worker-upload').analyze()).violations,
			).toEqual([])
			await cancelUpload(page)
			await detailAction(page, 'Back to documents')
			await createDocument(page)
			await expect(page).toHaveURL(/employee-documents\/create/)
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-worker-upload').analyze()).violations,
			).toEqual([])
			await cancelUpload(page)
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page
			.getByRole('row')
			.filter({ hasText: /^Browser reference / })
			.first()
			.click()
		await page.getByRole('tab', { name: 'Versions', exact: true }).click()
		await expect(
			page.getByRole('button', { name: 'Download version 1', exact: true }),
		).toBeVisible()
		await page.screenshot({ path: `.tmp/hcm-employee-documents/${variant}.png`, fullPage: true })
		await detailAction(page, 'Back to documents')
	}
})
test('applies and removes persisted tenant branding on the real worker document screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openDocuments(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-employee-documents').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openDocuments(page)
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
