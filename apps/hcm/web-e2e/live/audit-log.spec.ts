import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openAudit(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('AUDIT_LOG')
	await page.getByRole('button', { name: 'Audit Log — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Audit events', exact: true })).toBeVisible()
	await expect(page.locator('ef-hcm-audit-log').getByText('Loading audit events…')).toHaveCount(0)
}

test('TEST-AUDIT-LOG-005 filters actual history and preserves failed controls', /** Verify safe real evidence, empty results, validation, retry and persona denial. */ async ({
	page,
	context,
}) => {
	await openAudit(page)
	const view = page.locator('ef-hcm-audit-log')
	await expect(
		view.getByRole('gridcell', { name: 'role.created', exact: true }).first(),
	).toBeVisible()
	await view
		.getByRole('textbox', { name: 'Audit actor account', exact: true })
		.fill('dunder-mifflin/account/david')
	await view.getByRole('combobox', { name: 'Audit action', exact: true }).click()
	await page.getByRole('option', { name: 'role.created', exact: true }).click()
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(
		view.getByRole('gridcell', { name: 'role.created', exact: true }).first(),
	).toBeVisible()
	await view.getByRole('textbox', { name: 'Audit from', exact: true }).fill('2040-01-01T00:00:00Z')
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByText('No recorded actions match the filters')).toBeVisible()
	await view.getByRole('textbox', { name: 'Audit to', exact: true }).fill('2039-01-01T00:00:00Z')
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('note', { name: /Enter valid ISO date-times/ })).toBeVisible()
	await view.getByRole('textbox', { name: 'Audit to', exact: true }).fill('')
	await view.getByRole('textbox', { name: 'Audit from', exact: true }).fill('')
	await context.setOffline(true)
	await view.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(view.getByRole('note', { name: /Audit events could not be loaded/ })).toBeVisible()
	await expect(view.getByRole('textbox', { name: 'Audit actor account', exact: true })).toHaveValue(
		'dunder-mifflin/account/david',
	)
	await context.setOffline(false)
	await view.getByRole('button', { name: 'Retry audit', exact: true }).click()
	await expect(
		view.getByRole('gridcell', { name: 'role.created', exact: true }).first(),
	).toBeVisible()
	await expect(view.getByRole('button', { name: /Export|Delete|Edit/ })).toHaveCount(0)
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.goto('/audit/audit-log')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
	await expect(view).toHaveCount(0)
})
test('keeps the native audit filters and table accessible across themes and sizes', /** Check real responsive audit rows without feature CSS overrides. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openAudit(page)
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
				(await new AxeBuilder({ page }).include('ef-hcm-audit-log').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect unintended outer scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await expect(
				page.locator('ef-hcm-audit-log').getByRole('grid', { name: 'Audit events', exact: true }),
			).toBeVisible()
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.screenshot({ path: `.tmp/hcm-audit-log/${variant}.png`, fullPage: true })
	}
})
test('applies and removes persisted tenant branding on the real audit screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openAudit(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-audit-log').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openAudit(page)
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
