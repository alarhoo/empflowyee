import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
test.use({ actionTimeout: 20000 })
/** Exercise the real catalogue and persisted development persona before entering the feature. */
async function openReviews(page: Page): Promise<void> {
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
	await page.getByRole('textbox', { name: 'Search applications' }).fill('TENANT_ACCESS_REVIEWS')
	await page.getByRole('button', { name: 'Tenant Access Reviews — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Access reviews', exact: true })).toBeVisible()
}
/** Send acceptance reads through the real local runtime contract. */
function headers() {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': 'david',
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}
const api = 'http://127.0.0.1:4402/api/v1/access-control/reviews'
test('creates, reviews and closes persisted evidence in native FCL with safe draft retry', /** Real commands leave honest audit history and never manufacture snapshot rows. */ async ({
	page,
	context,
}) => {
	test.setTimeout(180000)
	await openReviews(page)
	const view = page.locator('ef-hcm-tenant-access-reviews'),
		label = `Browser review ${Date.now()}`
	await view.getByRole('button', { name: 'Start review', exact: true }).click()
	const dialog = page.locator('ef-hcm-review-dialog')
	await dialog.getByRole('textbox', { name: 'Review label', exact: true }).fill(label)
	await dialog
		.getByRole('textbox', { name: 'Reason for review action' })
		.fill('Local browser acceptance')
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-review-dialog').analyze()).violations,
	).toEqual([])
	await context.setOffline(true)
	await dialog.getByRole('button', { name: 'Start review', exact: true }).click()
	await expect(
		dialog.getByText('The operation could not be completed. Retry safely with the same draft.'),
	).toBeVisible()
	await context.setOffline(false)
	await dialog.getByRole('button', { name: 'Start review', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	const detail = page.locator('ef-hcm-review-detail')
	await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
	await expect(page).toHaveURL(/review=/)
	const id = new URL(page.url()).searchParams.get('review')
	if (!id) throw new Error('Selected review URL is missing its identity')
	await detail.getByRole('tab', { name: 'Assignment snapshot', exact: true }).click()
	await expect(detail.getByRole('grid', { name: 'Review assignment snapshot' })).toBeVisible()
	const response = await page.request.get(`${api}/${id}/items`, { headers: headers() })
	expect(response.status()).toBe(200)
	const snapshot = await response.json()
	expect(snapshot.items.length).toBeGreaterThan(0)
	await detail
		.getByRole('button', { name: 'Revoke David Wallace Tenant Administrator', exact: true })
		.click()
	await dialog
		.getByRole('textbox', { name: 'Reason for review action' })
		.fill('Verify protected administrator')
	await dialog.getByRole('button', { name: 'Revoke assignment', exact: true }).click()
	await expect(
		dialog.getByText('At least one enabled protected tenant administrator must remain.'),
	).toBeVisible()
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	for (const item of snapshot.items) {
		await detail.getByRole('tab', { name: 'Assignment snapshot', exact: true }).click()
		await detail
			.getByRole('button', { name: `Retain ${item.accountLabel} ${item.roleLabel}`, exact: true })
			.click()
		await dialog
			.getByRole('textbox', { name: 'Reason for review action' })
			.fill('Confirmed current assignment')
		await dialog.getByRole('button', { name: 'Retain assignment', exact: true }).click()
		await expect(dialog).toHaveCount(0)
	}
	await detail.getByRole('button', { name: 'Close review', exact: true }).click()
	await dialog
		.getByRole('textbox', { name: 'Reason for review action' })
		.fill('Completed local acceptance review')
	await dialog.getByRole('button', { name: 'Close review', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(detail.getByText('This review is closed and read-only.')).toBeVisible()
	expect(
		(await (await page.request.get(`${api}/${id}`, { headers: headers() })).json()).status,
	).toBe('Closed')
	await detail.getByRole('tab', { name: 'Assignment snapshot', exact: true }).click()
	await expect(detail.getByRole('button', { name: /^Retain |^Revoke |^Refresh / })).toHaveCount(0)
	expect(
		(await new AxeBuilder({ page }).include('ef-hcm-review-detail').analyze()).violations,
	).toEqual([])
	const audit = await page.request.get(
		'http://127.0.0.1:4402/api/v1/audit/events?action=review.closed',
		{ headers: headers() },
	)
	expect(audit.status()).toBe(200)
	expect(
		(await audit.json()).items.some(
			/** Confirm the actual review close event is queryable. */ (row: {
				targetId: string
				summary: { toState: string }
			}) => row.targetId === id && row.summary.toState === 'Closed',
		),
	).toBe(true)
	const activity = await page.request.get(
		'http://127.0.0.1:4402/api/v1/audit/me/activity?action=review.closed',
		{ headers: headers() },
	)
	expect(activity.status()).toBe(200)
	expect(JSON.stringify(await activity.json())).not.toContain('Completed local acceptance review')
	await detail.getByRole('button', { name: 'Back to reviews', exact: true }).click()
	await expect(detail).toHaveCount(0)
	await view.getByRole('button', { name: `View ${label}`, exact: true }).click()
	await expect(detail.getByText('This review is closed and read-only.')).toBeVisible()
	await page
		.getByRole('banner', { name: 'Shell Bar' })
		.getByRole('button', { name: 'David Wallace', exact: true })
		.click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Jim Halpert', exact: false }).click()
	await page.goto('/access-control/tenant-access-reviews')
	await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
	await expect(view).toHaveCount(0)
})
test('keeps the native review list and Object Page accessible across themes and sizes', /** Check real persisted review evidence without feature CSS overrides. */ async ({
	page,
}) => {
	test.setTimeout(360000)
	await openReviews(page)
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
				page.getByRole('combobox', { name: 'Review sort order', exact: true }),
			).toBeVisible()
			await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-tenant-access-reviews').analyze())
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
					.locator('ef-hcm-tenant-access-reviews')
					.getByRole('grid', { name: 'Access reviews', exact: true }),
			).toBeVisible()
		}
		await page
			.getByRole('button', { name: /^View Browser review / })
			.first()
			.click()
		const detail = page.locator('ef-hcm-review-detail')
		for (const width of [390, 768, 1440, 2560]) {
			await page.setViewportSize({ width, height: 1000 })
			await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
			await detail.getByRole('tab', { name: 'Assignment snapshot', exact: true }).click()
			await expect(
				detail.getByRole('button', { name: 'Apply snapshot filter', exact: true }),
			).toBeVisible()
			expect(
				(await new AxeBuilder({ page }).include('ef-hcm-review-detail').analyze()).violations,
			).toEqual([])
			expect(
				await page.evaluate(
					/** Check outer page overflow with both native columns. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
		}
		await page.screenshot({
			path: `.tmp/hcm-tenant-access-reviews/${variant}-detail.png`,
			fullPage: true,
		})
		await detail.getByRole('button', { name: 'Back to reviews', exact: true }).click()
		await page.setViewportSize({ width: 1440, height: 1000 })
		await expect(
			page.getByRole('combobox', { name: 'Review sort order', exact: true }),
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible()
		await page.screenshot({ path: `.tmp/hcm-tenant-access-reviews/${variant}.png`, fullPage: true })
	}
})
test('applies and removes persisted tenant branding on the real review screen', /** Temporarily change only local tenant presentation and restore its exact prior value even after failure. */ async ({
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
		await openReviews(page)
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
			(await new AxeBuilder({ page }).include('ef-hcm-tenant-access-reviews').analyze()).violations,
		).toEqual([])
		await database.query("UPDATE hcm.tenant SET primary_color=NULL WHERE id='local-dunder-mifflin'")
		await openReviews(page)
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
