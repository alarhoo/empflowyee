import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openTemplates(page: Page): Promise<void> {
	page.on(
		'pageerror',
		/** Surface native/component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'David Wallace', exact: false }).click()
	await expect(page.getByRole('button', { name: 'David Wallace', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Search', exact: true }).click()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('NOTIFICATION_TEMPLATES')
	await page
		.getByRole('button', { name: 'Notification Templates — Available', exact: true })
		.click()
	await expect(
		page.getByRole('grid', { name: 'Notification templates', exact: true }),
	).toBeVisible()
}
/** Send acceptance reads through the real local runtime contract. */
function headers() {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': 'david',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}
const api = 'http://127.0.0.1:4402/api/v1/notifications'

test('edits plain-text templates in a focused dialog from native Object Page details', /** Preserve original local configuration after real successful writes and retry checks. */ async ({
	page,
	context,
}) => {
	test.setTimeout(180000)
	const initial = await page.request.get(api + '/templates', { headers: headers() })
	expect(initial.status()).toBe(200)
	const original = (await initial.json()).items.find(
		/** Preserve the exact configured event text. */ (item: { eventType: string }) =>
			item.eventType === 'document.requested',
	)
	try {
		await openTemplates(page)
		const view = page.locator('ef-hcm-notification-templates')
		await view.getByRole('button', { name: 'View Document requested', exact: true }).click()
		await expect(page).toHaveURL(/event=document.requested/)
		await view.getByRole('tab', { name: 'Plain-text preview', exact: true }).click()
		await view
			.getByRole('textbox', { name: 'Sample request ID', exact: true })
			.fill('acceptance-request')
		await view.getByRole('textbox', { name: 'Sample due date', exact: true }).fill('2026-10-01')
		await view.getByRole('button', { name: 'Edit template', exact: true }).click()
		const dialog = page.locator('ef-hcm-templates-dialog')
		await dialog.getByRole('textbox', { name: 'Body', exact: true }).fill('https://outside.example')
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Verify bounded template editing')
		await dialog.getByRole('button', { name: 'Save', exact: true }).click()
		await expect(dialog.getByRole('note', { name: /Check plain text/ })).toBeVisible()
		await dialog
			.getByRole('textbox', { name: 'Body', exact: true })
			.fill('Request {requestId} is due {dueDate}.')
		await expect(
			dialog.getByText('Request acceptance-request is due 2026-10-01.', { exact: true }),
		).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-templates-dialog').analyze()).violations,
		).toEqual([])
		await context.setOffline(true)
		await dialog.getByRole('button', { name: 'Save', exact: true }).click()
		await expect(dialog.getByRole('note', { name: /could not be completed/ })).toBeVisible()
		await context.setOffline(false)
		await dialog.getByRole('button', { name: 'Save', exact: true }).click()
		await expect(dialog).toHaveCount(0)
		await view.getByRole('tab', { name: 'Overview', exact: true }).click()
		await expect(
			view.getByText('Request {requestId} is due {dueDate}.', { exact: true }),
		).toBeVisible()
		const saved = (
			await (await page.request.get(api + '/templates', { headers: headers() })).json()
		).items.find(
			/** Read the changed persisted event. */ (item: { eventType: string }) =>
				item.eventType === 'document.requested',
		)
		expect(saved.revision).toBe(original.revision + 1)
		await view.getByRole('button', { name: 'Back to templates', exact: true }).click()
		await expect(view.getByRole('tab', { name: 'Overview', exact: true })).toHaveCount(0)
	} finally {
		await context.setOffline(false)
		const latest = (
			await (await page.request.get(api + '/templates', { headers: headers() })).json()
		).items.find(
			/** Reload the actual revision for safe restoration. */ (item: { eventType: string }) =>
				item.eventType === 'document.requested',
		)
		if (latest.title !== original.title || latest.body !== original.body) {
			expect(
				(
					await page.request.put(api + '/templates/document.requested', {
						headers: headers(),
						data: {
							title: original.title,
							body: original.body,
							expectedRevision: latest.revision,
							reason: 'Restore original configuration after browser acceptance',
						},
					})
				).status(),
			).toBe(200)
		}
	}
})
test('toggles a registered rule and rejects employee administration', /** Use real revisioned commands and restore the exact prior rule choice. */ async ({
	page,
}) => {
	await openTemplates(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('NOTIFICATION_RULES')
	await page.getByRole('button', { name: 'Notification Rules — Available', exact: true }).click()
	const initial = await page.request.get(api + '/rules', { headers: headers() })
	const original = (await initial.json()).items.find(
		/** Choose the supported request switch. */ (item: { eventType: string }) =>
			item.eventType === 'document.requested',
	)
	try {
		const view = page.locator('ef-hcm-notification-rules')
		await view
			.getByRole('button', {
				name: (original.enabled ? 'Disable ' : 'Enable ') + 'Document requested',
				exact: true,
			})
			.click()
		const dialog = page.locator('ef-hcm-rules-dialog')
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Verify future delivery switch')
		await dialog.getByRole('button', { name: 'Save', exact: true }).click()
		await expect(dialog).toHaveCount(0)
		await expect(
			view.getByRole('button', {
				name: (original.enabled ? 'Enable ' : 'Disable ') + 'Document requested',
				exact: true,
			}),
		).toBeVisible()
		const latest = (
			await (await page.request.get(api + '/rules', { headers: headers() })).json()
		).items.find(
			/** Verify committed switch and revision. */ (item: { eventType: string }) =>
				item.eventType === 'document.requested',
		)
		expect(latest.enabled).toBe(!original.enabled)
		expect(latest.revision).toBe(original.revision + 1)
		await page.goto('/notifications/notification-rules')
		await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
	} finally {
		const latest = (
			await (await page.request.get(api + '/rules', { headers: headers() })).json()
		).items.find(
			/** Restore from the current optimistic revision. */ (item: { eventType: string }) =>
				item.eventType === 'document.requested',
		)
		if (latest.enabled !== original.enabled)
			expect(
				(
					await page.request.put(api + '/rules/document.requested', {
						headers: headers(),
						data: {
							enabled: original.enabled,
							expectedRevision: latest.revision,
							reason: 'Restore original switch after browser acceptance',
						},
					})
				).status(),
			).toBe(200)
	}
})
test('keeps template list-detail and rule actions accessible across four themes', /** Exercise native layout reflow, meaningful details and maintained controls. */ async ({
	page,
}) => {
	test.setTimeout(600000)
	await openTemplates(page)
	for (const [variant, label] of [
		['horizon-light', 'Horizon Light'],
		['horizon-dark', 'Horizon Dark'],
		['her-light', 'HER Light'],
		['her-dark', 'HER Dark'],
	]) {
		await page.getByRole('button', { name: 'Appearance', exact: true }).click()
		await page.getByRole('menuitemradio', { name: label }).click()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		for (const mode of ['list', 'detail', 'rules']) {
			if (mode === 'detail')
				await page.getByRole('button', { name: 'View Document requested', exact: true }).click()
			if (mode === 'rules') {
				await page.getByRole('button', { name: 'Back to templates', exact: true }).click()
				await page.getByRole('textbox', { name: 'Search applications' }).fill('NOTIFICATION_RULES')
				await page
					.getByRole('button', { name: 'Notification Rules — Available', exact: true })
					.click()
			}
			const host = mode === 'rules' ? 'ef-hcm-notification-rules' : 'ef-hcm-notification-templates'
			for (const width of [390, 768, 1440, 2560]) {
				await page.setViewportSize({ width, height: 1000 })
				if (mode === 'detail')
					await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
				else
					await expect(
						page.getByRole('button', {
							name: mode === 'rules' ? 'Reload rules' : 'Reload templates',
							exact: true,
						}),
					).toBeVisible()
				expect((await new AxeBuilder({ page }).include(host).analyze()).violations).toEqual([])
				expect(
					await page.evaluate(
						/** Detect unintended page-wide overflow. */ () =>
							document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true)
			}
			await page.setViewportSize({ width: 1440, height: 1000 })
			await page.screenshot({
				path: `.tmp/hcm-notification-administration/${variant}-${mode}.png`,
				fullPage: true,
			})
		}
		await page.getByRole('textbox', { name: 'Search applications' }).fill('NOTIFICATION_TEMPLATES')
		await page
			.getByRole('button', { name: 'Notification Templates — Available', exact: true })
			.click()
	}
})

test('applies and removes persisted tenant branding on the real template detail', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openTemplates(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-notification-templates').analyze())
				.violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openTemplates(page)
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
