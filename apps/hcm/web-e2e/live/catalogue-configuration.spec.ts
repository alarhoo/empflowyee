import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openCatalogue(page: Page): Promise<void> {
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
	await page
		.getByRole('textbox', { name: 'Search applications' })
		.fill('APP_CATALOGUE_CONFIGURATION')
	await page
		.getByRole('button', { name: 'App Catalogue Configuration — Available', exact: true })
		.click()
	await expect(page.getByRole('grid', { name: 'Canonical applications' })).toBeVisible()
}

test('TEST-APP-CATALOGUE-CONFIGURATION-005 inspects canonical data and real account discovery', /** Exercise read-only details, server reasons and retry without replacing the actor. */ async ({
	page,
	context,
}) => {
	await openCatalogue(page)
	await expect(page.getByText('170 of 170 applications', { exact: true })).toBeVisible()
	await page.getByRole('textbox', { name: 'Search catalogue metadata' }).fill('SSO_CONFIGURATION')
	await expect(page.getByText('1 of 170 applications', { exact: true })).toBeVisible()
	await page.getByRole('row').filter({ hasText: 'SSO Configuration' }).first().click()
	const detail = page.locator('ef-hcm-catalogue-detail')
	await expect(detail.getByText('Planned', { exact: true })).toBeVisible()
	await detail.getByRole('button', { name: 'Close detail' }).click()
	await page.getByRole('textbox', { name: 'Search catalogue metadata' }).fill('ROLE_MANAGEMENT')
	await page.getByRole('combobox', { name: 'Discovery account', exact: true }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.getByRole('row').filter({ hasText: 'Role Management' }).first().click()
	await detail.getByRole('tab', { name: 'Discovery', exact: true }).click()
	await expect(detail.getByText('Not discoverable', { exact: true })).toBeVisible()
	await expect(
		detail.getByText('Missing catalogue discovery permission', { exact: true }),
	).toBeVisible()
	await expect(
		detail.getByText('No visible Space placement for the account’s roles', { exact: true }),
	).toBeVisible()
	await context.setOffline(true)
	await page.getByRole('combobox', { name: 'Discovery account', exact: true }).click()
	await page.getByRole('option', { name: 'David Wallace', exact: false }).click()
	await expect(detail.getByRole('button', { name: 'Retry discovery' })).toBeVisible()
	await context.setOffline(false)
	await detail.getByRole('button', { name: 'Retry discovery' }).click()
	await expect(detail.getByText('Discoverable', { exact: true })).toBeVisible()
	await expect(
		page
			.getByRole('banner', { name: 'Shell Bar' })
			.getByRole('button', { name: 'David Wallace', exact: true }),
	).toBeVisible()
	await expect(page.getByRole('button', { name: 'Create', exact: true })).toHaveCount(0)
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-catalogue-configuration').analyze()).violations,
	).toEqual([])
})

test('rejects an employee direct route', /** Verify the normal employee session cannot enter administrative inspection. */ async ({
	page,
}) => {
	await page.goto('/access-control/app-catalogue-configuration')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
})
test('keeps native list/detail accessible across all themes and responsive widths', /** Verify real account data, keyboard section navigation and focus restoration with no axe exclusions. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openCatalogue(page)
	await page.getByRole('textbox', { name: 'Search catalogue metadata' }).fill('ROLE_MANAGEMENT')
	for (const [variant, label] of [
		['horizon-light', 'Horizon Light'],
		['horizon-dark', 'Horizon Dark'],
		['her-light', 'HER Light'],
		['her-dark', 'HER Dark'],
	]) {
		await selectAppearance(page, label)
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		await page.getByRole('row').filter({ hasText: 'Role Management' }).first().click()
		const detail = page.locator('ef-hcm-catalogue-detail')
		await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-catalogue-configuration').analyze())
					.violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect outer overflow independently of native table pop-ins. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await detail.getByRole('tab', { name: 'Placements', exact: true }).click()
		await expect(detail.getByRole('grid', { name: 'Application placements' })).toBeVisible()
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-catalogue-configuration').analyze())
				.violations,
		).toEqual([])
		await page.screenshot({
			path: `.tmp/hcm-catalogue-configuration/${variant}.png`,
			fullPage: true,
		})
		await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
		await expect(page.getByRole('row').filter({ hasText: 'Role Management' }).first()).toBeFocused()
	}
})
test('applies and removes persisted tenant branding on the real catalogue screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openCatalogue(page)
		await page.getByRole('textbox', { name: 'Search catalogue metadata' }).fill('ROLE_MANAGEMENT')
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
			(await new AxeBuilder({ page }).include('ef-hcm-catalogue-configuration').analyze())
				.violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openCatalogue(page)
		await page.getByRole('textbox', { name: 'Search catalogue metadata' }).fill('ROLE_MANAGEMENT')
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
