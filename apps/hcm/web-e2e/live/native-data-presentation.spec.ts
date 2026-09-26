import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { openApplicationSearch } from './shell-controls'

test.use({ viewport: { width: 1440, height: 1000 }, actionTimeout: 12000 })

/** Open the account's maintained settings surface. */
async function settings(page: Page, name = 'Jim Halpert'): Promise<void> {
	await page.getByRole('button', { name, exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
}

/** Enter an implemented app through canonical search. */
async function app(page: Page, code: string, title: string): Promise<void> {
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications', exact: true }).fill(code)
	await page.getByRole('button', { name: `${title} — Available`, exact: true }).click()
}

test('preferences visibly save and format real timestamps across reloads', /** Verify account choices reach business output rather than only the settings preview. */ async ({
	page,
}) => {
	await page.goto('/')
	await settings(page)
	await page.getByRole('listitem', { name: /^Language & Region/ }).click()
	await page.getByRole('combobox', { name: 'Date format', exact: true }).click()
	await page.getByRole('option', { name: 'Long', exact: true }).click()
	await page.getByRole('combobox', { name: 'Time format', exact: true }).click()
	await page.getByRole('option', { name: '12-hour', exact: true }).click()
	await expect(
		page.getByText('Preferences saved in this browser and applied to displayed dates and times.'),
	).toBeVisible()
	await page.getByRole('button', { name: 'Close', exact: true }).click()
	await app(page, 'MY_SECURITY', 'My Security')
	const expiry = page.locator('ui5-form-item').filter({ hasText: /expires/i })
	await expect(expiry).toContainText(/AM|PM/)
	await page.reload()
	await expect(expiry).toContainText(/AM|PM/)
	await settings(page)
	await page.getByRole('listitem', { name: /^Language & Region/ }).click()
	await page.getByRole('combobox', { name: 'Time format', exact: true }).click()
	await page.getByRole('option', { name: '24-hour', exact: true }).click()
	await page.getByRole('button', { name: 'Close', exact: true }).click()
	await expect(expiry).not.toContainText(/AM|PM/)
})

test('role sorting uses view settings and permissions use native grouped rows', /** Preserve server sort ownership, native status semantics and grouped read/edit controls. */ async ({
	page,
}) => {
	await page.goto('/')
	await settings(page)
	await page.getByRole('combobox', { name: 'Development persona', exact: true }).click()
	await page.getByRole('option', { name: /David Wallace/ }).click()
	await app(page, 'ROLE_MANAGEMENT', 'Role Management')
	await expect(
		page.locator('ui5-form[hcmHeader] ui5-select').filter({ hasText: /ascending|descending/i }),
	).toHaveCount(0)
	await page.getByRole('button', { name: 'Role view settings', exact: true }).click()
	const dialog = page.getByRole('dialog', { name: 'View Settings' })
	await expect(dialog).toBeVisible()
	// Native rows in order: Ascending, Descending, then the declared sort fields.
	await page.getByRole('radio', { name: 'Item Selection.' }).nth(1).click()
	const response = page.waitForResponse(
		/** Observe actual server sort parameters. */ (res) =>
			res.url().includes('/access-control/roles?') &&
			new URL(res.url()).searchParams.get('sort') === 'label:desc',
	)
	await page.getByRole('button', { name: 'OK', exact: true }).click()
	expect((await response).status()).toBe(200)
	await page.getByRole('row').filter({ hasText: 'Manager' }).first().click()
	const detail = page.locator('ef-hcm-role-detail')
	await expect(detail.locator('[fd-object-status]')).toHaveClass(/inverted/)
	await detail.getByRole('tab', { name: 'Permissions', exact: true }).click()
	await expect(detail.locator('ui5-li-group')).toHaveCount(2)
	await expect(detail.locator('ui5-checkbox')).toHaveCount(0)
	await expect(detail.locator('ui5-li').first()).toBeVisible()
	await page.screenshot({ path: '.tmp/native-grouped-permissions.png' })
	await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
	await page.getByRole('button', { name: 'Create role', exact: true }).click()
	const option = page.locator('ef-hcm-role-permissions ui5-li').first()
	await option.click()
	await expect(option).toHaveAttribute('selected', '')
	await page.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await app(page, 'AUDIT_LOG', 'Audit Log')
	await expect(page.locator('ui5-datetime-picker')).toHaveCount(2)
	await page.locator('ui5-datetime-picker').first().getByRole('button').click()
	await expect(page.locator('ui5-datetime-picker').first().locator('ui5-calendar')).toBeVisible()
})

test('committed read removes an unread tray item and updates its badge', /** Seed one isolated PostgreSQL test notification and exercise the real read API without modifying existing messages. */ async ({
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
	const id = `native-read-${randomUUID()}`
	await database.connect()
	await database.query("SELECT set_config('hcm.tenant_id','local-dunder-mifflin',false)")
	try {
		await database.query(
			"INSERT INTO hcm.notification_intent (tenant_id,id,event_id,event_type,source_request_id,recipient_account_id,recipient_key,outcome,reason_code) SELECT tenant_id,$1,$1,'document.requested',$1,id,id,'Delivered','test-fixture' FROM hcm.user_account WHERE tenant_id='local-dunder-mifflin' AND email='jim.halpert@dundermifflin.example'",
			[id],
		)
		await database.query(
			"INSERT INTO hcm.notification (tenant_id,id,intent_id,recipient_account_id,event_type,title,body,source_request_id) SELECT tenant_id,id,id,recipient_account_id,event_type,$1,'A dedicated read-transition test message.',source_request_id FROM hcm.notification_intent WHERE id=$1",
			[id],
		)
		await page.goto('/')
		const count = await database.query(
			"SELECT count(*)::int AS total FROM hcm.notification n JOIN hcm.user_account a ON a.id=n.recipient_account_id AND a.tenant_id=n.tenant_id WHERE n.tenant_id='local-dunder-mifflin' AND a.email='jim.halpert@dundermifflin.example' AND n.read_at IS NULL",
		)
		await expect(page.locator('ui5-shellbar')).toHaveAttribute(
			'notifications-count',
			String(count.rows[0].total),
		)
		await page.locator('ui5-shellbar [data-ui5-stable="notifications"]').click()
		const tray = page.locator('ui5-popover[header-text="Notifications"]')
		await expect(tray.locator('ui5-li-notification')).toHaveCount(count.rows[0].total)
		const message = tray.locator('ui5-li-notification').filter({ hasText: id })
		await message.getByRole('button', { name: /More/i }).click()
		await page.getByRole('menuitem', { name: 'Mark read', exact: true }).click()
		await expect(message).toHaveCount(0)
		await expect(page.locator('ui5-shellbar')).toHaveAttribute(
			'notifications-count',
			count.rows[0].total === 1 ? '' : String(count.rows[0].total - 1),
		)
		const saved = await database.query(
			'SELECT read_at, revision FROM hcm.notification WHERE id=$1',
			[id],
		)
		expect(saved.rows[0].read_at).not.toBeNull()
		expect(saved.rows[0].revision).toBe(2)
		await page.getByRole('button', { name: 'Open My Notifications', exact: true }).click()
		await page.getByRole('combobox', { name: 'Notification read state', exact: true }).click()
		await page.getByRole('option', { name: 'Read', exact: true }).click()
		await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
		await expect(page.locator('ui5-li-notification').filter({ hasText: id })).toHaveCount(1)
	} finally {
		await database.query('DELETE FROM hcm.notification WHERE id=$1', [id])
		await database.query('DELETE FROM hcm.notification_intent WHERE id=$1', [id])
		await database.end()
	}
})
