import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

test.use({ actionTimeout: 20000 })

test('retains begin-column filters and guards routed draft navigation', /** Browser history changes selection without destroying filters; leaving a complex form requires explicit discard. */ async ({
	page,
}) => {
	await openRoles(page)
	await page.getByRole('searchbox', { name: 'Search role names' }).fill('Tenant')
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await page.getByRole('button', { name: 'View Tenant Administrator', exact: true }).click()
	await expect(
		page.locator('ef-hcm-role-detail').getByRole('tab', { name: 'Overview', exact: true }),
	).toBeVisible()
	await page.goBack()
	await expect(page.locator('ef-hcm-role-detail')).toHaveCount(0)
	await expect(page.getByRole('searchbox', { name: 'Search role names' })).toHaveValue('Tenant')
	await expect(page.getByRole('button', { name: 'View Employee', exact: true })).toHaveCount(0)
	await page.getByRole('button', { name: 'Create role', exact: true }).click()
	await page.getByRole('textbox', { name: 'Role name', exact: true }).fill('Unsaved routed draft')
	await page.getByRole('button', { name: 'empFLOWyee home', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(page).toHaveURL(/role-management\/new$/)
	await expect(page.getByRole('textbox', { name: 'Role name', exact: true })).toHaveValue(
		'Unsaved routed draft',
	)
	await page.getByRole('button', { name: 'empFLOWyee home', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(page).toHaveURL(/:\d+\/$/)
})

/** Use the real persisted persona selector and catalogue navigation to open the admitted app. */
async function openRoles(page: Page): Promise<void> {
	page.on(
		'pageerror',
		/** Report unexpected runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	page.on(
		'response',
		/** Report failed real API calls during browser acceptance. */ (response) => {
			if (response.status() >= 400 && response.url().includes('/api/'))
				console.log('API FAILURE', response.status(), response.url())
		},
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'David Wallace', exact: false }).click()
	await expect(page.getByRole('button', { name: 'David Wallace', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Search', exact: true }).click()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('ROLE_MANAGEMENT')
	await page.getByRole('button', { name: 'Role Management \u2014 Available', exact: true }).click()
	await expect(page).toHaveURL(/\/access-control\/role-management$/, { timeout: 15000 })
	await expect(page.getByRole('grid', { name: 'Tenant roles' })).toBeVisible({ timeout: 20000 })
}

test('TEST-ROLE-MANAGEMENT-005 manages real roles and preserves dirty drafts', /** Exercise native forms and PostgreSQL-backed create/update/delete without mocked API responses. */ async ({
	page,
}) => {
	await openRoles(page)
	const label = `Browser verification ${Date.now()}`
	await page.getByRole('button', { name: 'Create role', exact: true }).click()
	const dialog = page.locator('ef-hcm-role-edit-page ef-hcm-role-editor')
	await expect(dialog).toBeVisible()
	await dialog.getByRole('button', { name: 'Save role', exact: true }).click()
	await expect(dialog.getByRole('textbox', { name: 'Role name', exact: true })).toBeFocused()
	await dialog.getByRole('textbox', { name: 'Role name', exact: true }).fill(label)
	await dialog
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Browser acceptance verification')
	await dialog
		.getByRole('searchbox', { name: 'Filter permissions', exact: true })
		.fill('hcm.audit.activity.self.read')
	await dialog.getByRole('checkbox', { name: /hcm\.audit\.activity\.self\.read/ }).click()
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(dialog.getByRole('textbox', { name: 'Role name', exact: true })).toHaveValue(label)
	const created = page.waitForResponse(
		/** Wait for the actual committed API command. */ (response) =>
			response.url().endsWith('/access-control/roles') && response.request().method() === 'POST',
	)
	await dialog.getByRole('button', { name: 'Save role', exact: true }).click()
	expect((await created).status()).toBe(201)
	await expect(dialog).toBeHidden()
	await page.getByRole('button', { name: `Edit ${label}`, exact: true }).click()
	const edit = page.locator('ef-hcm-role-edit-page ef-hcm-role-editor')
	await edit.getByRole('textbox', { name: 'Role name', exact: true }).fill(`${label} updated`)
	await edit
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Verify revisioned update')
	await edit.getByRole('button', { name: 'Save role', exact: true }).click()
	await expect(edit).toBeHidden()
	await page.getByRole('button', { name: `Delete ${label} updated`, exact: true }).click()
	const remove = page.locator('ef-hcm-role-editor > ui5-dialog').first()
	await remove
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Remove the role created by this browser verification')
	await remove.getByRole('button', { name: 'Delete role', exact: true }).click()
	await expect(remove).toBeHidden()
	await expect(
		page.getByRole('button', { name: `View ${label} updated`, exact: true }),
	).toHaveCount(0)
	await page.getByRole('button', { name: 'View Tenant Administrator', exact: true }).click()
	const view = page.locator('ef-hcm-role-detail')
	await expect(
		view.getByText('System role. Its label and permissions are read-only.'),
	).toBeVisible()
	await expect(view.getByRole('button', { name: 'Save role', exact: true })).toHaveCount(0)
	await expect(page).toHaveURL(/role=tenant-administrator/)
	await view.getByRole('tab', { name: 'Assignees', exact: true }).click()
	await expect(view.getByText('David Wallace', { exact: true })).toBeVisible()
	await view.getByRole('tab', { name: 'History / Audit', exact: true }).click()
	await expect(view.getByRole('grid', { name: 'Role audit history' })).toBeVisible()
	await view.getByRole('button', { name: 'Back to roles', exact: true }).click()
	await expect(view).toBeHidden()
})

test('uses all four native themes, responsive popins and accessible controls', /** Audit the real feature at four widths and theme variants without importing theme logic into it. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openRoles(page)
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
			await expect(page.getByRole('grid', { name: 'Tenant roles' })).toBeVisible({ timeout: 20000 })
			expect(
				await page.evaluate(
					/** Detect viewport overflow outside native table popins. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			const result = await new AxeBuilder({ page }).include('ef-hcm-role-management').analyze()
			expect(result.violations).toEqual([])
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.getByRole('button', { name: 'View Tenant Administrator', exact: true }).click()
		const detail = page.locator('ef-hcm-role-detail')
		await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			await expect(
				detail.getByRole('heading', { name: 'Tenant Administrator', exact: true }).first(),
			).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-role-management').analyze()).violations,
			).toEqual([])
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		for (const section of ['Permissions', 'Assignees', 'History / Audit']) {
			await detail.getByRole('tab', { name: section, exact: true }).click()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-role-management').analyze()).violations,
			).toEqual([])
		}
		await detail.getByRole('tab', { name: 'Overview', exact: true }).click()
		await page.screenshot({ path: `.tmp/hcm-role-management/${variant}.png`, fullPage: true })
		await detail.getByRole('button', { name: 'Back to roles', exact: true }).click()
		await expect(
			page.getByRole('button', { name: 'View Tenant Administrator', exact: true }),
		).toBeFocused()
	}
	await page.getByRole('button', { name: 'Create role', exact: true }).click()
	await expect(page).toHaveURL(/role-management\/new$/)
	const result = await new AxeBuilder({ page }).include('ef-hcm-role-edit-page').analyze()
	expect(result.violations).toEqual([])
	await page.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Tenant roles' })).toBeVisible()
})

test('preserves failed commands and supports real query recovery', /** Disconnect transport without substituting fake business responses, then retry the same draft. */ async ({
	page,
	context,
}) => {
	await openRoles(page)
	await page.getByRole('searchbox', { name: 'Search role names' }).fill('no-such-role-acceptance')
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(page.getByText('No roles match these filters', { exact: true })).toBeVisible()
	await page.getByRole('searchbox', { name: 'Search role names' }).fill('')
	await context.setOffline(true)
	await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
	await expect(
		page
			.getByText('The operation could not be completed. Retry safely with the same draft.')
			.first(),
	).toBeVisible()
	await context.setOffline(false)
	await page.getByRole('button', { name: 'Retry', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'View Tenant Administrator', exact: true }),
	).toBeVisible()
	await page.getByRole('button', { name: 'Create role', exact: true }).click()
	const editor = page.locator('ef-hcm-role-edit-page ef-hcm-role-editor')
	// Duplicate-label rejection proves the request reached the real server after transport recovery.
	await editor.getByRole('textbox', { name: 'Role name', exact: true }).fill('Employee')
	await editor
		.getByRole('textbox', { name: 'Reason for change', exact: true })
		.fill('Verify failed draft preservation')
	await context.setOffline(true)
	await editor.getByRole('button', { name: 'Save role', exact: true }).click()
	await expect(
		editor.getByText('The operation could not be completed. Retry safely with the same draft.'),
	).toBeVisible()
	await expect(editor.getByRole('textbox', { name: 'Role name', exact: true })).toHaveValue(
		'Employee',
	)
	await context.setOffline(false)
	await editor.getByRole('button', { name: 'Save role', exact: true }).click()
	await expect(editor.getByText('A role with this name already exists.')).toBeVisible()
	await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(editor).toBeHidden()
	await page.getByRole('button', { name: 'David Wallace', exact: true }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
	await page.goto('/access-control/role-management')
	await expect(page).toHaveURL(/\/access-denied$/)
	await expect(page.locator('ef-hcm-role-management')).toHaveCount(0)
})

test('applies and removes persisted tenant branding on the real role screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openRoles(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-role-management').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openRoles(page)
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
