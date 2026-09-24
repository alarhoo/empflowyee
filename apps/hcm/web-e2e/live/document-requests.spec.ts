import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
const api = 'http://127.0.0.1:4402/api/v1/documents'
test.use({ actionTimeout: 20000 })
/** Send real local requests through persisted persona authority. */ function headers(
	persona = 'toby',
) {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': persona,
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}
/** Enter by catalogue search with the selected persisted persona. */ async function openRequests(
	page: Page,
	hr = false,
) {
	await page.goto('/')
	if (hr) {
		await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
		await page.getByRole('menuitem', { name: /^Settings/ }).click()
		await page.getByRole('combobox', { name: 'Development persona' }).click()
		await page.getByRole('option', { name: /Toby Flenderson/ }).click()
		await expect(page.getByRole('button', { name: 'Toby Flenderson', exact: true })).toBeVisible()
	}
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('DOCUMENT_REQUESTS')
	await page.getByRole('button', { name: 'Document Requests — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Document requests', exact: true })).toBeVisible()
}
/** Find an exact persisted request through server filtering. */ async function selectRequest(
	page: Page,
	id: string,
) {
	await page.getByRole('textbox', { name: 'Search request IDs', exact: true }).fill(id)
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await page
		.getByRole('row')
		.filter({ hasText: '' + id })
		.first()
		.click()
	await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
}
/** Follow native action relocation while FCL animates between responsive columns. */ async function action(
	page: Page,
	name: string,
	selector = 'ef-hcm-object-page',
) {
	const screen = page.locator(selector),
		button = screen.getByRole('button', { name, exact: true }),
		overflow = screen.getByRole('button', { name: 'Additional Options', exact: true })
	await expect(
		/** Retry only while the native toolbar moves its action. */ async () => {
			if (await button.isVisible()) return
			await overflow.click({ timeout: 500 })
		},
	).toPass({ timeout: 15000 })
	await button.click()
}
/** Create an enabled persisted classification for this browser scenario. */ async function type(
	page: Page,
) {
	const code = 'REQUEST_BROWSER_' + Date.now()
	const response = await page.request.post(api + '/types', {
		headers: headers(),
		data: { code, label: 'Browser request type', reason: 'Verify local request workflow' },
	})
	expect(response.status()).toBe(201)
	return { ...(await response.json()), code }
}
/** Submit actual immutable bytes through the employee's native focused uploader. */ async function submit(
	page: Page,
	id: string,
	filename: string,
) {
	await openRequests(page)
	await selectRequest(page, id)
	await action(page, 'Submit document')
	const dialog = page.locator('ef-hcm-request-action-dialog')
	await page.locator('ef-hcm-request-action-dialog input[type=file]').setInputFiles({
		name: filename,
		mimeType: 'application/pdf',
		buffer: Buffer.from('%PDF-1.7\nRequest browser acceptance\n%%EOF'),
	})
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-request-action-dialog').analyze()).violations,
	).toEqual([])
	await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
	await expect(dialog).toBeHidden()
	await page.getByRole('tab', { name: 'Submissions', exact: true }).click()
	await expect(page.getByRole('row', { name: new RegExp(filename) })).toBeVisible()
}
/** Use one focused HR reason dialog against the displayed persisted revision. */ async function transition(
	page: Page,
	name: string,
) {
	await action(page, name)
	const dialog = page.locator('ef-hcm-request-action-dialog')
	await dialog
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Reviewed through the browser')
	await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
	await expect(dialog).toBeHidden()
}
test('creates on a routed page, submits as employee, replaces and accepts the current immutable version', /** Exercise the complete local lifecycle with actual PostgreSQL, private files and native UI. */ async ({
	page,
}) => {
	test.setTimeout(240000)
	const classification = await type(page)
	await openRequests(page, true)
	await action(page, 'Create request', 'ef-hcm-document-requests')
	await expect(page).toHaveURL(/document-requests\/create/)
	const screen = page.locator('ef-hcm-request-create')
	await screen.getByRole('combobox', { name: 'Worker', exact: true }).click()
	await page.getByRole('option', { name: /Jim Halpert/ }).click()
	await screen
		.getByRole('textbox', { name: 'Find document type', exact: true })
		.fill(classification.code)
	await screen.getByRole('button', { name: 'Find types', exact: true }).click()
	await screen.getByRole('combobox', { name: 'Document type', exact: true }).click()
	await page
		.getByRole('option', { name: `Browser request type (${classification.code})`, exact: true })
		.click()
	await screen
		.getByRole('textbox', { name: 'Instructions', exact: true })
		.fill('Provide a clear scanned record')
	await screen
		.getByRole('textbox', { name: 'Due date (YYYY-MM-DD)', exact: true })
		.fill('2026-10-15')
	await screen
		.getByRole('textbox', { name: 'Reason', exact: true })
		.fill('Validate end-to-end request')
	await action(page, 'Cancel', 'ef-hcm-request-create')
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-request-create').analyze()).violations,
	).toEqual([])
	await action(page, 'Create request', 'ef-hcm-request-create')
	await expect(page).toHaveURL(/request=/)
	const id = new URL(page.url()).searchParams.get('request')
	if (!id) throw new Error('Committed request URL missing')
	await submit(page, id, 'first.pdf')
	const downloadPromise = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Download version 1', exact: true }).click()
	expect((await downloadPromise).suggestedFilename()).toBe('first.pdf')
	await openRequests(page, true)
	await selectRequest(page, id)
	await transition(page, 'Request replacement')
	await submit(page, id, 'replacement.pdf')
	await openRequests(page, true)
	await selectRequest(page, id)
	await page.getByRole('tab', { name: 'Submissions', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Download version 2', exact: true })).toBeVisible()
	await transition(page, 'Accept submission')
	await page.getByRole('tab', { name: 'Overview', exact: true }).click()
	await expect(
		page.locator('ef-hcm-object-page').getByText('Completed', { exact: true }),
	).toBeVisible()
	const persisted = await page.request.get(api + '/requests/' + id, { headers: headers() })
	expect((await persisted.json()).revision).toBe(5)
})
/** Prepare a Submitted request only through real API commands for presentation acceptance. */ async function requestedDocument(
	page: Page,
) {
	const classification = await type(page),
		workers = await page.request.get(api + '/request-worker-options?q=Jim', { headers: headers() }),
		workerId = (await workers.json()).items[0].id
	const response = await page.request.post(api + '/requests', {
		headers: headers(),
		data: {
			workerId,
			typeId: classification.id,
			instructions: 'Review accessibility of the request',
			reason: 'Validate request presentation',
		},
	})
	expect(response.status()).toBe(201)
	const item = await response.json()
	const uploaded = await page.request.post(api + '/me/requests/' + item.id + '/submit', {
		headers: headers('jim'),
		multipart: {
			metadata: JSON.stringify({ expectedRevision: 1 }),
			file: {
				name: 'accessibility.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.from('%PDF-1.7\nAccessibility acceptance\n%%EOF'),
			},
		},
	})
	expect(uploaded.status()).toBe(200)
	return item
}
test('keeps request list and Object Page accessible across all themes and responsive widths', /** Use the approved production floorplans, without feature styling or synthetic HTTP responses. */ async ({
	page,
}) => {
	test.setTimeout(600000)
	const item = await requestedDocument(page)
	await openRequests(page)
	await page.getByRole('textbox', { name: 'Search request IDs', exact: true }).fill(item.id)
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
				(await new AxeBuilder({ page }).include('ef-hcm-document-requests').analyze()).violations,
			).toEqual([])
			await page
				.getByRole('row')
				.filter({ hasText: '' + item.id })
				.first()
				.click()
			await page.getByRole('tab', { name: 'Submissions', exact: true }).click()
			await expect(
				page.getByRole('button', { name: 'Download version 1', exact: true }),
			).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-document-requests').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Native columns must retain the outer viewport width. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await action(page, 'Close detail')
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page
			.getByRole('row')
			.filter({ hasText: '' + item.id })
			.first()
			.click()
		await page.getByRole('tab', { name: 'Submissions', exact: true }).click()
		await page.screenshot({
			path: '.tmp/hcm-document-requests/' + variant + '.png',
			fullPage: true,
		})
		await action(page, 'Close detail')
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
		await openRequests(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-document-requests').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openRequests(page)
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
