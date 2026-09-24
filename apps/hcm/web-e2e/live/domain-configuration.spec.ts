import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openDomains(page: Page): Promise<void> {
	page.on(
		'pageerror',
		/** Surface native/component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'David Wallace', exact: false }).click()
	await expect(page.getByRole('button', { name: 'David Wallace', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('DOMAIN_CONFIGURATION')
	await page.getByRole('button', { name: 'Domain Configuration — Available', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Current hostnames', exact: true })).toBeVisible()
}

test('TEST-DOMAIN-CONFIGURATION-005 shows the persisted projection and recovers from an outage', /** Exercise the real API without a configuration editor or fixture fallback. */ async ({
	page,
	context,
}) => {
	await openDomains(page)
	const view = page.locator('ef-hcm-domain-configuration')
	await expect(view.getByText('acme.localhost', { exact: true })).toBeVisible()
	await expect(view.getByText('Account projection', { exact: true })).toBeVisible()
	await expect(view.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
	await context.setOffline(true)
	await view.getByRole('button', { name: 'Refresh', exact: true }).click()
	await expect(
		view.getByRole('note', { name: /Domain information could not be loaded/ }),
	).toBeVisible()
	await expect(view.getByText('acme.localhost', { exact: true })).toHaveCount(0)
	await context.setOffline(false)
	await view.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(view.getByText('acme.localhost', { exact: true })).toBeVisible()
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.goto('/identity-access/domain-configuration')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
	await expect(view).toHaveCount(0)
})
test('keeps the native singleton page accessible across themes and sizes', /** Check maintained controls and readable real hostnames without CSS overrides. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openDomains(page)
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
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-domain-configuration').analyze())
					.violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect unintended outer scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await expect(
				page.locator('ef-hcm-domain-configuration').getByText('acme.localhost', { exact: true }),
			).toBeVisible()
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.screenshot({ path: `.tmp/hcm-domain-configuration/${variant}.png`, fullPage: true })
	}
})
test('applies and removes persisted tenant branding on the real domain screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openDomains(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-domain-configuration').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openDomains(page)
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
