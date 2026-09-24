import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

test.use({ actionTimeout: 20000 })
const api = 'http://127.0.0.1:4402/api/v1/notifications/me'
/** Authorize local acceptance through the same runtime persona contract. */
function headers() {
	return {
		host: 'acme.localhost',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'x-hcm-development-persona': 'jim',
		'Idempotency-Key': randomUUID(),
	}
}
/** Enter a real catalogue app using the default persisted employee account. */
async function openApp(page: Page, code: string, title: string): Promise<void> {
	await page.goto('/')
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill(code)
	await page.getByRole('button', { name: title + ' — Available', exact: true }).click()
}

test('persists category choices with safe retry and independent drafts', /** Exercise real preference writes and restore the prior effective choice. */ async ({
	page,
	context,
}) => {
	test.setTimeout(180000)
	const initial = await page.request.get(api + '/preferences', { headers: headers() })
	expect(initial.status()).toBe(200)
	const baseline = (await initial.json()).items[0]
	try {
		await openApp(page, 'MY_NOTIFICATION_PREFERENCES', 'My Notification Preferences')
		const view = page.locator('ef-hcm-notification-preferences')
		const checkbox = view.getByRole('checkbox', { name: 'Document requested', exact: true })
		await expect(checkbox).toBeVisible()
		await checkbox.click()
		await view.getByRole('checkbox', { name: 'Document submitted', exact: true }).click()
		await view.getByRole('button', { name: 'Cancel Document submitted', exact: true }).click()
		await expect(
			view.getByRole('button', { name: 'Save Document requested', exact: true }),
		).toBeVisible()
		await expect(
			view.getByRole('button', { name: 'Save Document submitted', exact: true }),
		).toHaveCount(0)
		await view.getByRole('button', { name: 'Reload preferences', exact: true }).click()
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
		await context.setOffline(true)
		await view.getByRole('button', { name: 'Save Document requested', exact: true }).click()
		await expect(
			view.getByRole('note', { name: /The operation could not be completed/ }),
		).toBeVisible()
		await context.setOffline(false)
		await view.getByRole('button', { name: 'Save Document requested', exact: true }).click()
		await expect(
			view.getByRole('note', { name: /Document requested preference saved/ }),
		).toBeVisible()
		const saved = (
			await (await page.request.get(api + '/preferences', { headers: headers() })).json()
		).items[0]
		expect(saved.enabled).toBe(!baseline.enabled)
		expect(saved.revision).toBe(baseline.revision + 1)
		await view.getByRole('button', { name: 'Reload preferences', exact: true }).click()
		await expect(checkbox).toBeChecked({ checked: !baseline.enabled })
		await checkbox.click()
		await view.getByRole('button', { name: 'Reload preferences', exact: true }).click()
		await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
		await expect(checkbox).toBeChecked({ checked: !baseline.enabled })
	} finally {
		await context.setOffline(false)
		const current = (
			await (await page.request.get(api + '/preferences', { headers: headers() })).json()
		).items[0]
		if (current.enabled !== baseline.enabled) {
			const restored = await page.request.put(api + '/preferences/' + baseline.eventType, {
				headers: headers(),
				data: { enabled: baseline.enabled, expectedRevision: current.revision },
			})
			expect(restored.status()).toBe(200)
		}
	}
})

test('filters the real inbox and retries a failed read without losing filters', /** Local inboxes remain empty until a real document event delivers a message. */ async ({
	page,
	context,
}) => {
	await openApp(page, 'MY_NOTIFICATIONS', 'My Notifications')
	const view = page.locator('ef-hcm-my-notifications')
	await expect(view.locator('ui5-notification-list')).toBeVisible()
	const query = view.getByRole('textbox', { name: 'Search notification title or body' })
	await query.fill('literal acceptance search')
	await context.setOffline(true)
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible()
	await context.setOffline(false)
	await view.getByRole('button', { name: 'Retry inbox', exact: true }).click()
	await expect(query).toHaveValue('literal acceptance search')
	await expect(view.getByText('No notifications match the filters', { exact: true })).toBeVisible()
	await expect(view.getByRole('button', { name: /^View request/ })).toHaveCount(0)
})

test('keeps both self-service pages accessible across four themes and sizes', /** Verify native controls, responsive form reflow and page boundaries. */ async ({
	page,
}) => {
	test.setTimeout(600000)
	for (const [code, title, host] of [
		['MY_NOTIFICATIONS', 'My Notifications', 'ef-hcm-my-notifications'],
		[
			'MY_NOTIFICATION_PREFERENCES',
			'My Notification Preferences',
			'ef-hcm-notification-preferences',
		],
	]) {
		await openApp(page, code, title)
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
				if (code === 'MY_NOTIFICATIONS') {
					await expect(
						page.getByRole('combobox', { name: 'Notification sort order', exact: true }),
					).toBeVisible()
					await expect(
						page.getByRole('button', { name: 'Apply filters', exact: true }),
					).toBeVisible()
				} else
					await expect(
						page.getByRole('checkbox', { name: 'Replacement requested', exact: true }),
					).toBeVisible()
				expect((await new AxeBuilder({ page }).include(host).analyze()).violations).toEqual([])
				expect(
					await page.evaluate(
						/** Detect unintended horizontal page scrolling. */ () =>
							document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true)
			}
			await page.setViewportSize({ width: 1440, height: 1000 })
			await page.screenshot({
				path: `.tmp/hcm-notifications/${code}-${variant}.png`,
				fullPage: true,
			})
		}
	}
})

test('applies and removes persisted tenant branding on the real notification preferences', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openApp(page, 'MY_NOTIFICATION_PREFERENCES', 'My Notification Preferences')
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
			(await new AxeBuilder({ page }).include('ef-hcm-notification-preferences').analyze())
				.violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openApp(page, 'MY_NOTIFICATION_PREFERENCES', 'My Notification Preferences')
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
