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
/** Enter a catalogue app by search, switching from the default employee to HR when requested. */ async function openApp(
	page: Page,
	code: string,
	title: string,
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill(code)
	await page.getByRole('button', { name: title + ' — Available', exact: true }).click()
}
/** Enter by catalogue search with the selected persisted persona. */ async function openRequests(
	page: Page,
	hr = false,
) {
	await openApp(page, 'DOCUMENT_REQUESTS', 'Document Requests', hr)
	await expect(page.getByRole('grid', { name: 'Document requests', exact: true })).toBeVisible()
}
/** Follow one persisted in-app notice for a request from the recipient's real inbox. */ async function followNotification(
	page: Page,
	id: string,
	title: string,
	hr = false,
) {
	await openApp(page, 'MY_NOTIFICATIONS', 'My Notifications', hr)
	const view = page.locator('ef-hcm-my-notifications')
	await view.getByRole('textbox', { name: 'Search notification title or body' }).fill(id)
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await view.locator('ui5-li-notification').filter({ hasText: title }).first().click()
	await expect(page).toHaveURL(new RegExp('document-requests\\?.*request=' + id))
	await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
	return new URL(page.url()).searchParams.get('scope')
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
	await settled(page)
}
/**
 * Wait for the FCL mid column to stop resizing. Opening the native toolbar overflow while it
 * recalculates can leave the overflow expanded without a popover (shared UX watch item).
 */ async function settled(page: Page) {
	await expect
		.poll(
			/** Compare the Object Page width across a short interval. */ () =>
				page.locator('ef-hcm-object-page').evaluate(
					/** Resolve true once consecutive widths match. */ (element) =>
						new Promise<boolean>(
							/** Complete after a second measurement. */ (resolve) => {
								const width = element.getBoundingClientRect().width
								setTimeout(
									/** Measure again after the column transition interval. */ () =>
										resolve(Math.abs(element.getBoundingClientRect().width - width) < 1),
									400,
								)
							},
						),
				),
		)
		.toBe(true)
}
/** Follow native action relocation while FCL animates between responsive columns. */ async function action(
	page: Page,
	name: string,
	selector = 'ef-hcm-object-page',
) {
	const screen = page.locator(selector),
		button = screen.getByRole('button', { name, exact: true }),
		// Detail navigation may also overflow while FCL columns resize; object actions precede it.
		overflow = screen.getByRole('button', { name: 'Additional Options', exact: true }).first()
	await expect(
		/** Retry while the native toolbar moves its action; allow the overflow to open before toggling again. */ async () => {
			if (await button.isVisible()) return
			await overflow.click({ timeout: 500 })
			await expect(button).toBeVisible({ timeout: 2000 })
		},
	).toPass({ timeout: 20000 })
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
	const due = screen.getByRole('textbox', { name: 'Due date', exact: true })
	await due.fill('Oct 15, 2026')
	await due.press('Tab')
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
test('opens each notification recipient in the request scope that authorizes it', /** Worker notices open Own scope; the HR requester's submitted notice opens HR scope. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	const item = await requestedDocument(page)
	expect(await followNotification(page, item.id, 'Document requested')).toBe('own')
	await expect(
		page.locator('ef-hcm-object-page').getByText('Submitted', { exact: true }),
	).toBeVisible()
	expect(await followNotification(page, item.id, 'Document submitted', true)).toBe('hr')
	await expect(
		page.locator('ef-hcm-object-page').getByText('Submitted', { exact: true }),
	).toBeVisible()
	await action(page, 'Accept submission')
	const dialog = page.locator('ef-hcm-request-action-dialog')
	await expect(dialog.getByRole('textbox', { name: 'Reason', exact: true })).toBeVisible()
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(dialog.getByRole('textbox', { name: 'Reason', exact: true })).toBeHidden()
})
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
