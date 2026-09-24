import { selectAppearance, openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
// Black-box API assertions intentionally depend only on observed response fields.
interface AssignmentSummary {
	revision: number
	roles: { items: { id: string; grantId: string }[] }
}
interface RoleDetail {
	id: string
	revision: number
}

test.use({ actionTimeout: 20000 })
const accountId = 'dunder-mifflin/account/jim'
const accountPath = `http://127.0.0.1:4402/api/v1/access-control/assignments/${encodeURIComponent(accountId)}`
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openAssignments(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('ACCESS_ASSIGNMENTS')
	await page.getByRole('button', { name: 'Access Assignments — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Tenant accounts' })).toBeVisible()
}
/** Authenticate test cleanup through the same public local runtime contract. */
function headers() {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': 'david',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}
test('TEST-ACCESS-ASSIGNMENTS-005 grants and revokes persisted roles through focused dialogs', /** Use native Signal Forms and real APIs, preserving drafts after transport failure. */ async ({
	page,
	context,
}) => {
	await openAssignments(page)
	const label = `Assignment browser ${Date.now()}`
	const created = await page.request.post('http://127.0.0.1:4402/api/v1/access-control/roles', {
		headers: headers(),
		data: {
			label,
			permissionCodes: ['hcm.audit.activity.self.read'],
			reason: 'Browser assignment verification',
		},
	})
	expect(created.status()).toBe(201)
	const role = (await created.json()) as RoleDetail
	try {
		await page.getByRole('row').filter({ hasText: 'Jim Halpert' }).first().click()
		const detail = page.locator('ef-hcm-assignment-detail')
		await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
		await detail.getByRole('button', { name: 'Grant role', exact: true }).click()
		const dialog = page.locator('ef-hcm-assignment-dialog')
		await dialog.getByRole('textbox', { name: 'Find role', exact: true }).fill(label)
		await dialog.getByRole('button', { name: 'Search roles', exact: true }).click()
		await dialog.getByRole('combobox', { name: 'Role to grant' }).click()
		await page.getByRole('option', { name: label, exact: true }).click()
		await dialog
			.getByRole('textbox', { name: 'Reason for assignment change' })
			.fill('Browser acceptance reason')
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-assignment-dialog').analyze()).violations,
		).toEqual([])
		await context.setOffline(true)
		await dialog.getByRole('button', { name: 'Grant role', exact: true }).click()
		await expect(
			dialog.getByText('The operation could not be completed. Retry safely with the same draft.'),
		).toBeVisible()
		await context.setOffline(false)
		await dialog.getByRole('button', { name: 'Grant role', exact: true }).click()
		await expect(dialog).toBeHidden()
		await detail.getByRole('tab', { name: 'Roles', exact: true }).click()
		await expect(detail.getByRole('button', { name: `Revoke ${label}`, exact: true })).toBeVisible()
		const persisted = (await (
			await page.request.get(accountPath, { headers: headers() })
		).json()) as AssignmentSummary
		expect(
			persisted.roles.items.some(
				/** Verify the real committed association. */ (item) => item.id === role.id,
			),
		).toBe(true)
		await detail.getByRole('button', { name: `Revoke ${label}`, exact: true }).click()
		const revoke = page.locator('ef-hcm-assignment-dialog')
		await revoke
			.getByRole('textbox', { name: 'Reason for assignment change' })
			.fill('Browser revoke acceptance')
		await revoke.getByRole('button', { name: 'Revoke role', exact: true }).click()
		await expect(revoke).toBeHidden()
		await detail.getByRole('tab', { name: 'Roles', exact: true }).click()
		await expect(detail.getByRole('button', { name: `Revoke ${label}`, exact: true })).toHaveCount(
			0,
		)
	} finally {
		await context.setOffline(false)
		const current = (await (
			await page.request.get(accountPath, { headers: headers() })
		).json()) as AssignmentSummary
		const grant = current.roles.items.find(
			/** Remove only this test's own association if a browser assertion failed. */ (item) =>
				item.id === role.id,
		)
		if (grant)
			expect(
				(
					await page.request.post(`${accountPath}/revoke`, {
						headers: headers(),
						data: {
							roleId: role.id,
							grantId: grant.grantId,
							expectedRevision: current.revision,
							reason: 'Browser acceptance cleanup',
						},
					})
				).status(),
			).toBe(200)
		expect(
			(
				await page.request.post(
					`http://127.0.0.1:4402/api/v1/access-control/roles/${role.id}/delete`,
					{
						headers: headers(),
						data: { expectedRevision: role.revision, reason: 'Browser acceptance cleanup' },
					},
				)
			).status(),
		).toBe(200)
	}
})
test('keeps native list/detail accessible across all themes and responsive widths', /** Verify real account data, keyboard section navigation and focus restoration with no axe exclusions. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openAssignments(page)
	for (const [variant, label] of [
		['horizon-light', 'Horizon Light'],
		['horizon-dark', 'Horizon Dark'],
		['her-light', 'HER Light'],
		['her-dark', 'HER Dark'],
	]) {
		await selectAppearance(page, label)
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		await page.getByRole('row').filter({ hasText: 'Jim Halpert' }).first().click()
		const detail = page.locator('ef-hcm-assignment-detail')
		await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-access-assignments').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Detect outer overflow independently of native table pop-ins. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
		}
		await page.setViewportSize({ width: 1440, height: 1000 })
		await detail.getByRole('tab', { name: 'Roles', exact: true }).click()
		await expect(detail.getByRole('grid', { name: 'Assigned roles' })).toBeVisible()
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-access-assignments').analyze()).violations,
		).toEqual([])
		await page.screenshot({ path: `.tmp/hcm-access-assignments/${variant}.png`, fullPage: true })
		await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
		await expect(page.getByRole('row').filter({ hasText: 'Jim Halpert' }).first()).toBeFocused()
	}
})
test('protects the last administrator and denies employee direct navigation', /** Surface the actual server invariant and keep failed drafts until explicit discard. */ async ({
	page,
}) => {
	await openAssignments(page)
	await page.getByRole('row').filter({ hasText: 'David Wallace' }).first().click()
	const detail = page.locator('ef-hcm-assignment-detail')
	await detail.getByRole('tab', { name: 'Roles', exact: true }).click()
	await detail.getByRole('button', { name: 'Revoke Tenant Administrator', exact: true }).click()
	const dialog = page.locator('ef-hcm-assignment-dialog')
	await dialog
		.getByRole('textbox', { name: 'Reason for assignment change' })
		.fill('Verify protected administrator')
	await dialog.getByRole('button', { name: 'Revoke role', exact: true }).click()
	await expect(
		dialog.getByText('At least one enabled protected tenant administrator must remain.'),
	).toBeVisible()
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(dialog).toBeHidden()
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
	await page.goto('/access-control/access-assignments')
	await expect(page).toHaveURL(/access-denied$/)
})

test('applies and removes persisted tenant branding on the real assignment screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openAssignments(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-access-assignments').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openAssignments(page)
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
test('guards a dirty assignment against browser history navigation', /** Query-only history changes must run Angular's existing leave guard before destroying detail. */ async ({
	page,
}) => {
	await openAssignments(page)
	await page.getByRole('row').filter({ hasText: 'Jim Halpert' }).first().click()
	await page
		.locator('ef-hcm-assignment-detail')
		.getByRole('button', { name: 'Grant role', exact: true })
		.click()
	const dialog = page.locator('ef-hcm-assignment-dialog')
	await dialog
		.getByRole('textbox', { name: 'Reason for assignment change' })
		.fill('Unsaved history draft')
	await page.evaluate(/** Trigger real same-document browser history. */ () => history.back())
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(page).toHaveURL(/account=/)
	await expect(dialog.getByRole('textbox', { name: 'Reason for assignment change' })).toHaveValue(
		'Unsaved history draft',
	)
	await page.evaluate(
		/** Try leaving again after the cancelled history transition. */ () => history.back(),
	)
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(dialog).toBeHidden()
	await expect(page.locator('ef-hcm-assignment-detail')).toHaveCount(0)
	await expect(page.getByRole('grid', { name: 'Tenant accounts' })).toBeVisible()
})
