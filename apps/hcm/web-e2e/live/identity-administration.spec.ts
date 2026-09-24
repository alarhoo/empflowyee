import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openIdentity(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('IDENTITY_ADMINISTRATION')
	await page
		.getByRole('button', { name: 'Identity Administration — Available', exact: true })
		.click()
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

/** Connect only for scoped verification cleanup; account deletion remains absent from product APIs. */
async function verificationDatabase(): Promise<Client> {
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
	return database
}
test('TEST-IDENTITY-ADMINISTRATION-005 creates and changes a real credential-free account', /** Exercise focused forms, failure recovery, immutable fields and persisted revision through the real API. */ async ({
	page,
	context,
}) => {
	await openIdentity(page)
	const email = `browser.identity.${randomUUID()}@example.test`
	const database = await verificationDatabase()
	try {
		await page.getByRole('button', { name: 'Create account', exact: true }).click()
		const dialog = page.locator('ef-hcm-account-dialog')
		await dialog.getByRole('combobox', { name: 'Existing person' }).click()
		await page.getByRole('option', { name: 'Jim Halpert', exact: true }).click()
		await dialog.getByRole('textbox', { name: 'Account email', exact: true }).fill(email)
		await dialog
			.getByRole('textbox', { name: 'Reason for account change' })
			.fill('Browser account acceptance')
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-account-dialog').analyze()).violations,
		).toEqual([])
		await context.setOffline(true)
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await expect(
			dialog.getByText('The operation could not be completed. Retry safely with the same draft.'),
		).toBeVisible()
		await context.setOffline(false)
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await expect(dialog).toBeHidden()
		const detail = page.locator('ef-hcm-account-detail')
		await expect(detail.getByText(email, { exact: true })).toBeVisible()
		const record = (
			await database.query('SELECT id,enabled,revision FROM hcm.user_account WHERE email=$1', [
				email,
			])
		).rows[0]
		expect(record.enabled).toBe(true)
		expect(record.revision).toBe(1)
		expect(
			(
				await database.query(
					'SELECT count(*)::int AS count FROM hcm.account_role WHERE account_id=$1',
					[record.id],
				)
			).rows[0].count,
		).toBe(0)
		expect(
			(
				await database.query(
					'SELECT count(*)::int AS count FROM hcm.development_persona WHERE account_id=$1',
					[record.id],
				)
			).rows[0].count,
		).toBe(0)
		await detail.getByRole('button', { name: 'Disable account', exact: true }).click()
		await expect(dialog.getByRole('textbox', { name: 'Account email' })).toHaveCount(0)
		await dialog
			.getByRole('textbox', { name: 'Reason for account change' })
			.fill('Browser disable acceptance')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await expect(dialog).toBeHidden()
		await expect(detail.getByText('Disabled', { exact: true })).toBeVisible()
		await detail.getByRole('button', { name: 'Enable account', exact: true }).click()
		await dialog
			.getByRole('textbox', { name: 'Reason for account change' })
			.fill('Browser enable acceptance')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await expect(dialog).toBeHidden()
		await expect(detail.getByText('Enabled', { exact: true })).toBeVisible()
		expect(
			(await database.query('SELECT revision FROM hcm.user_account WHERE id=$1', [record.id]))
				.rows[0].revision,
		).toBe(3)
		await detail.getByRole('tab', { name: 'Roles', exact: true }).click()
		await expect(detail.getByText('No roles assigned')).toBeVisible()
		await detail.getByRole('link', { name: 'Open Access Assignments' }).click()
		await expect(
			page.locator('ef-hcm-assignment-detail').getByText(email, { exact: true }),
		).toBeVisible()
	} finally {
		await context.setOffline(false)
		// Remove only the uniquely named ungranted verification account; retain authentic command/audit history.
		await database.query(
			'DELETE FROM hcm.user_account WHERE tenant_id=$1 AND email=$2 AND NOT EXISTS (SELECT 1 FROM hcm.account_role WHERE account_id=hcm.user_account.id AND tenant_id=hcm.user_account.tenant_id)',
			['local-dunder-mifflin', email],
		)
		await database.end()
	}
})
test('keeps native list/detail accessible across all themes and responsive widths', /** Verify real account data, keyboard section navigation and focus restoration with no axe exclusions. */ async ({
	page,
}) => {
	test.setTimeout(180000)
	await openIdentity(page)
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
		await page.getByRole('button', { name: 'View Jim Halpert', exact: true }).click()
		const detail = page.locator('ef-hcm-account-detail')
		await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-identity-administration').analyze())
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
		await detail.getByRole('tab', { name: 'Roles', exact: true }).click()
		await expect(detail.getByRole('grid', { name: 'Account roles' })).toBeVisible()
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-identity-administration').analyze())
				.violations,
		).toEqual([])
		await page.screenshot({
			path: `.tmp/hcm-identity-administration/${variant}.png`,
			fullPage: true,
		})
		await detail.getByRole('button', { name: 'Back to accounts', exact: true }).click()
		await expect(page.getByRole('button', { name: 'View Jim Halpert', exact: true })).toBeFocused()
	}
})
test('protects the last administrator and preserves rejected status drafts', /** Verify the real invariant response rather than a disabled cosmetic control. */ async ({
	page,
}) => {
	await openIdentity(page)
	await page.getByRole('button', { name: 'View David Wallace', exact: true }).click()
	await page
		.locator('ef-hcm-account-detail')
		.getByRole('button', { name: 'Disable account', exact: true })
		.click()
	const dialog = page.locator('ef-hcm-account-dialog')
	await dialog
		.getByRole('textbox', { name: 'Reason for account change' })
		.fill('Verify administrator protection')
	await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
	await expect(
		dialog.getByText('At least one enabled protected tenant administrator must remain.'),
	).toBeVisible()
	await expect(dialog.getByRole('textbox', { name: 'Reason for account change' })).toHaveValue(
		'Verify administrator protection',
	)
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(dialog).toBeHidden()
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.goto('/identity-access/identity-administration')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
})
test('applies and removes persisted tenant branding on the real identity screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openIdentity(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-identity-administration').analyze())
				.violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openIdentity(page)
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
test('keeps authorized reads usable after management permission is removed', /** Verify read-only presentation and direct API denial from real persisted grants. */ async ({
	page,
}) => {
	const database = await verificationDatabase()
	const removed = (
		await database.query(
			"DELETE FROM hcm.role_permission WHERE permission_code='hcm.identity-access.accounts.manage' AND role_id IN (SELECT role_id FROM hcm.account_role WHERE account_id='dunder-mifflin/account/david') RETURNING tenant_id,role_id,permission_code",
		)
	).rows
	try {
		await openIdentity(page)
		await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0)
		await page.getByRole('button', { name: 'View Jim Halpert', exact: true }).click()
		const detail = page.locator('ef-hcm-account-detail')
		await expect(detail.getByRole('button', { name: 'Disable account', exact: true })).toHaveCount(
			0,
		)
		await expect(
			detail.getByText('jim.halpert@dundermifflin.example', { exact: true }),
		).toBeVisible()
		expect(
			(
				await page.request.post('http://127.0.0.1:4402/api/v1/identity-access/accounts', {
					headers: headers(),
					data: {
						personId: 'dunder-mifflin/person/jim',
						email: 'denied@example.test',
						reason: 'Read-only acceptance',
					},
				})
			).status(),
		).toBe(403)
		expect(
			(await new AxeBuilder({ page }).include('ef-hcm-identity-administration').analyze())
				.violations,
		).toEqual([])
	} finally {
		for (const row of removed)
			await database.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
				[row.tenant_id, row.role_id, row.permission_code],
			)
		await database.end()
	}
})
