import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openExports(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('DATA_EXPORT_LOG')
	await page.getByRole('button', { name: 'Data Export Log — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Export events', exact: true })).toBeVisible()
	await expect(
		page.locator('ef-hcm-data-export-log').getByText('Loading export events…'),
	).toHaveCount(0)
}

test('TEST-DATA-EXPORT-LOG-005 reads honest empty history and preserves failed filters', /** Exercise the real query without fake exports or generator/download actions. */ async ({
	page,
	context,
}) => {
	await openExports(page)
	const view = page.locator('ef-hcm-data-export-log')
	await expect(view.getByText('No export activity matches the filters')).toBeVisible()
	await expect(view.getByRole('combobox', { name: 'Export action', exact: true })).toHaveCount(0)
	await view
		.getByRole('textbox', { name: 'Export actor account', exact: true })
		.fill('dunder-mifflin/account/david')
	await view.getByRole('textbox', { name: 'Export from', exact: true }).fill('2040-01-01T00:00:00Z')
	await view.getByRole('textbox', { name: 'Export to', exact: true }).fill('2039-01-01T00:00:00Z')
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('note', { name: /Enter valid ISO date-times/ })).toBeVisible()
	await view.getByRole('textbox', { name: 'Export to', exact: true }).fill('')
	await context.setOffline(true)
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('note', { name: /Export events could not be loaded/ })).toBeVisible()
	await expect(
		view.getByRole('textbox', { name: 'Export actor account', exact: true }),
	).toHaveValue('dunder-mifflin/account/david')
	await context.setOffline(false)
	await view.getByRole('button', { name: 'Retry exports', exact: true }).click()
	await expect(view.getByRole('note', { name: /Export events could not be loaded/ })).toHaveCount(0)
	await expect(view.getByText('No export activity matches the filters')).toBeVisible()
	await expect(view.getByRole('button', { name: /Download|Create|Delete|Edit/ })).toHaveCount(0)
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.goto('/audit/data-export-log')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
	await expect(view).toHaveCount(0)
})
test('keeps the native export-log filters and table accessible across themes and sizes', /** Check real empty export evidence without feature CSS overrides. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openExports(page)
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
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-data-export-log').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect unintended outer scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await expect(
				page
					.locator('ef-hcm-data-export-log')
					.getByRole('grid', { name: 'Export events', exact: true }),
			).toBeVisible()
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.screenshot({ path: `.tmp/hcm-data-export-log/${variant}.png`, fullPage: true })
	}
})
test('applies and removes persisted tenant branding on the real export-log screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openExports(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-data-export-log').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openExports(page)
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
