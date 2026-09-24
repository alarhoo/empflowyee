import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openSecurity(page: Page): Promise<void> {
	page.on(
		'pageerror',
		/** Surface native/component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Search', exact: true }).click()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('MY_SECURITY')
	await page.getByRole('button', { name: 'My Security — Available', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Assigned roles', exact: true })).toBeVisible()
}

test('TEST-MY-SECURITY-005 reads own identity and real role search with retry', /** Exercise self-service behavior without a tenant account picker or fake security controls. */ async ({
	page,
	context,
}) => {
	await openSecurity(page)
	const view = page.locator('ef-hcm-my-security')
	await expect(view.getByText('Jim Halpert', { exact: true })).toBeVisible()
	await expect(view.getByText('jim.halpert@dundermifflin.example', { exact: true })).toBeVisible()
	await expect(view.getByText('local-development', { exact: true })).toBeVisible()
	await expect(view.getByRole('gridcell', { name: 'Employee', exact: true })).toBeVisible()
	await view.getByRole('textbox', { name: 'Search own roles' }).fill('No matching role')
	await view.getByRole('button', { name: 'Search roles', exact: true }).click()
	await expect(view.getByText('No roles match the search')).toBeVisible()
	await context.setOffline(true)
	await view.getByRole('button', { name: 'Refresh', exact: true }).click()
	await expect(
		view.getByRole('note', { name: /Your security summary could not be loaded/ }),
	).toBeVisible()
	await expect(view.getByText('Jim Halpert', { exact: true })).toHaveCount(0)
	await context.setOffline(false)
	await view.getByRole('button', { name: 'Retry summary', exact: true }).click()
	await expect(view.getByText('Jim Halpert', { exact: true })).toBeVisible()
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'Jim Halpert', exact: true })
		.click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Michael Scott', exact: false }).click()
	await expect(
		page
			.getByRole('banner', { name: 'Shell Bar' })
			.getByRole('button', { name: 'Michael Scott', exact: true }),
	).toBeVisible()
	await expect(view).toHaveCount(0)
	await page.getByRole('button', { name: 'Search', exact: true }).click()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('MY_SECURITY')
	await page.getByRole('button', { name: 'My Security — Available', exact: true }).click()
	await expect(view.getByText('Michael Scott', { exact: true })).toBeVisible()
	await expect(view.getByText('Jim Halpert', { exact: true })).toHaveCount(0)
	await expect(view.getByRole('button', { name: /Password|MFA|Revoke/ })).toHaveCount(0)
})
test('keeps the native singleton page accessible across themes and sizes', /** Check maintained controls and readable real hostnames without CSS overrides. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openSecurity(page)
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
				(await new AxeBuilder({ page }).include('ef-hcm-my-security').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect unintended outer scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await expect(
				page
					.locator('ef-hcm-my-security')
					.getByText('jim.halpert@dundermifflin.example', { exact: true }),
			).toBeVisible()
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.screenshot({ path: `.tmp/hcm-my-security/${variant}.png`, fullPage: true })
	}
})
test('applies and removes persisted tenant branding on the real security screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openSecurity(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-my-security').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openSecurity(page)
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
