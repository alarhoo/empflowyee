import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
const api = 'http://127.0.0.1:4402/api/v1/documents'
/** Use actual persisted HR authority to prepare isolated local acceptance documents. */
function headers() {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': 'toby',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}
/** Author a genuine worker attachment through the same bounded multipart API used by the UI. */
async function sharedDocument(page: Page) {
	const stamp = Date.now(),
		label = 'Self document ' + stamp
	const type = await page.request.post(api + '/types', {
		headers: headers(),
		data: {
			code: 'SELF_BROWSER_' + stamp,
			label: 'Self browser type',
			reason: 'Validate self sharing',
		},
	})
	expect(type.status()).toBe(201)
	const workers = await page.request.get(api + '/workers?q=Jim', { headers: headers() })
	const workerId = (await workers.json()).items[0].id
	const result = await page.request.post(api + '/worker-documents', {
		headers: headers(),
		multipart: {
			metadata: JSON.stringify({
				workerId,
				typeId: (await type.json()).id,
				label,
				employeeVisible: true,
				reason: 'Share acceptance version',
			}),
			file: {
				name: 'shared.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.from('%PDF-1.7\nShared acceptance\n%%EOF'),
			},
		},
	})
	expect(result.status()).toBe(201)
	return result.json()
}
/** Enter through real catalogue discovery as the default employee persona. */
async function openDocuments(page: Page) {
	await page.goto('/')
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('MY_DOCUMENTS')
	await page.getByRole('button', { name: 'My Documents — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'My documents', exact: true })).toBeVisible()
}
/** Follow the native selected-object action including responsive overflow. */
async function back(page: Page) {
	const button = page.getByRole('button', { name: 'Close detail', exact: true }),
		overflow = page
			.locator('ef-hcm-object-page')
			.getByRole('button', { name: 'Additional Options', exact: true })
	await expect(
		/** Allow native FCL toolbar relocation to settle. */ async () => {
			if (await button.isVisible()) return
			await overflow.click({ timeout: 500 })
		},
	).toPass({ timeout: 15000 })
	await button.click()
}
test('downloads only shared own versions and rejects a stale download after HR revokes sharing', /** Exercise real employee HTTP, immutable files and current sharing authority. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	const item = await sharedDocument(page)
	const hidden = await page.request.post(
		api + '/worker-documents/' + item.document.id + '/versions',
		{
			headers: headers(),
			multipart: {
				metadata: JSON.stringify({
					employeeVisible: false,
					expectedRevision: 1,
					reason: 'Keep replacement private',
				}),
				file: {
					name: 'hidden.pdf',
					mimeType: 'application/pdf',
					buffer: Buffer.from('%PDF-1.7\nPrivate replacement\n%%EOF'),
				},
			},
		},
	)
	expect(hidden.status()).toBe(200)
	await openDocuments(page)
	await page
		.getByRole('textbox', { name: 'Search document labels', exact: true })
		.fill(item.document.label)
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await page
		.getByRole('row')
		.filter({ hasText: '' + item.document.label })
		.first()
		.click()
	await page.getByRole('tab', { name: 'Versions', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Download version 1', exact: true })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Download version 2', exact: true })).toHaveCount(0)
	await expect(page.getByText('hidden.pdf', { exact: true })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Upload new version', exact: true })).toHaveCount(0)
	const pending = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Download version 1', exact: true }).click()
	const download = await pending
	expect(download.suggestedFilename()).toBe('shared.pdf')
	expect(await download.failure()).toBeNull()
	expect(
		(
			await page.request.put(
				api +
					'/worker-documents/' +
					item.document.id +
					'/versions/' +
					item.version.id +
					'/visibility',
				{
					headers: headers(),
					data: {
						employeeVisible: false,
						expectedRevision: 1,
						reason: 'Revoke browser acceptance sharing',
					},
				},
			)
		).status(),
	).toBe(200)
	await page.getByRole('button', { name: 'Download version 1', exact: true }).click()
	await expect(page.getByRole('note', { name: /no longer available/ })).toBeVisible()
	await page.getByRole('button', { name: 'Reload versions', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Download version 1', exact: true })).toHaveCount(0)
	await back(page)
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(
		page
			.getByRole('row')
			.filter({ hasText: '' + item.document.label })
			.first(),
	).toHaveCount(0)
})
test('keeps self list and Object Page accessible across all themes and responsive widths', /** Use the approved production floorplans, without feature styling or synthetic HTTP responses. */ async ({
	page,
}) => {
	test.setTimeout(600000)
	const item = await sharedDocument(page)
	await openDocuments(page)
	await page
		.getByRole('textbox', { name: 'Search document labels', exact: true })
		.fill(item.document.label)
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	for (const [variant, label] of [
		['horizon-light', 'Horizon Light'],
		['horizon-dark', 'Horizon Dark'],
		['her-light', 'HER Light'],
		['her-dark', 'HER Dark'],
	]) {
		await page.setViewportSize({ width: 1440, height: 1000 })
		await selectAppearance(page, label)
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-my-documents').analyze()).violations,
			).toEqual([])
			await page
				.getByRole('row')
				.filter({ hasText: '' + item.document.label })
				.first()
				.click()
			await page.getByRole('tab', { name: 'Versions', exact: true }).click()
			await expect(
				page.getByRole('button', { name: 'Download version 1', exact: true }),
			).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-my-documents').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Native columns must retain the outer viewport width. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await back(page)
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page
			.getByRole('row')
			.filter({ hasText: '' + item.document.label })
			.first()
			.click()
		await page.getByRole('tab', { name: 'Versions', exact: true }).click()
		await page.screenshot({ path: '.tmp/hcm-my-documents/' + variant + '.png', fullPage: true })
		await back(page)
	}
})
test('applies and removes persisted tenant branding on the real self-service screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
			(await new AxeBuilder({ page }).include('ef-hcm-my-documents').analyze()).violations,
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
