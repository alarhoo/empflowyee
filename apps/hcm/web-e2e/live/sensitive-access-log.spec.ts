import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openSensitive(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('SENSITIVE_ACCESS_LOG')
	await page.getByRole('button', { name: 'Sensitive Access Log — Available', exact: true }).click()
	await expect(
		page.getByRole('grid', { name: 'Sensitive access events', exact: true }),
	).toBeVisible()
	await expect(
		page.locator('ef-hcm-sensitive-access-log').getByText('Loading sensitive access events…'),
	).toHaveCount(0)
}

test('TEST-SENSITIVE-ACCESS-LOG-005 keeps stream evidence truthful through retry and persona changes', /** Query real local storage without fabricated download history or content access. */ async ({
	page,
	context,
}) => {
	await openSensitive(page)
	const view = page.locator('ef-hcm-sensitive-access-log')
	await expect(view.getByText('No sensitive access matches the filters')).toBeVisible()
	await expect(
		view.getByRole('note', { name: /Authorization alone does not confirm completion/ }),
	).toBeVisible()
	await view
		.getByRole('textbox', { name: 'Sensitive access actor account', exact: true })
		.fill('dunder-mifflin/account/david')
	await view.getByRole('combobox', { name: 'Sensitive access action', exact: true }).click()
	await page.getByRole('option', { name: 'document.download-authorized', exact: true }).click()
	await view.getByRole('combobox', { name: 'Sensitive access outcome', exact: true }).click()
	await page.getByRole('option', { name: 'Authorized', exact: true }).click()
	await view
		.getByRole('textbox', { name: 'Sensitive access from', exact: true })
		.fill('2040-01-01T00:00:00Z')
	await view
		.getByRole('textbox', { name: 'Sensitive access to', exact: true })
		.fill('2039-01-01T00:00:00Z')
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('note', { name: /Enter valid ISO date-times/ })).toBeVisible()
	await view.getByRole('textbox', { name: 'Sensitive access to', exact: true }).fill('')
	await context.setOffline(true)
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(
		view.getByRole('note', { name: /Sensitive access events could not be loaded/ }),
	).toBeVisible()
	await expect(
		view.getByRole('textbox', { name: 'Sensitive access actor account', exact: true }),
	).toHaveValue('dunder-mifflin/account/david')
	await context.setOffline(false)
	await view.getByRole('button', { name: 'Retry access log', exact: true }).click()
	await expect(
		view.getByRole('note', { name: /Sensitive access events could not be loaded/ }),
	).toHaveCount(0)
	await expect(view.getByText('No sensitive access matches the filters')).toBeVisible()
	await expect(
		view.getByRole('button', { name: /Download|Export|Create|Delete|Edit/ }),
	).toHaveCount(0)
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.goto('/audit/sensitive-access-log')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
	await expect(view).toHaveCount(0)
})
test('keeps the native sensitive-access filters and table accessible across themes and sizes', /** Check real empty sensitive-access evidence without feature CSS overrides. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openSensitive(page)
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
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			await expect(
				page.getByRole('combobox', { name: 'Sensitive access sort', exact: true }),
			).toBeVisible()
			await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-sensitive-access-log').analyze())
					.violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect unintended outer scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await expect(
				page
					.locator('ef-hcm-sensitive-access-log')
					.getByRole('grid', { name: 'Sensitive access events', exact: true }),
			).toBeVisible()
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await expect(
			page.getByRole('combobox', { name: 'Sensitive access sort', exact: true }),
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible()
		await page.screenshot({ path: `.tmp/hcm-sensitive-access-log/${variant}.png`, fullPage: true })
	}
})
test('applies and removes persisted tenant branding on the real sensitive-access screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openSensitive(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-sensitive-access-log').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openSensitive(page)
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
