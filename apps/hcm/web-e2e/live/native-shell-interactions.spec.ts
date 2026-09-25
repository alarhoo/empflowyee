import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 1000 }, actionTimeout: 15000 })

/** Open the maintained user settings dialog from native profile chrome. */
async function settings(page: Page, name = 'Jim Halpert'): Promise<void> {
	await page.getByRole('button', { name, exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await expect(page.getByRole('dialog', { name: 'User Settings', exact: true })).toBeVisible()
}
/** Select an advertised local persona through the real runtime API. */
async function administrator(page: Page): Promise<void> {
	await settings(page)
	await page.getByRole('combobox', { name: 'Development persona', exact: true }).click()
	await page.getByRole('option', { name: /David Wallace/ }).click()
	await expect(page.getByRole('button', { name: 'David Wallace', exact: true })).toBeVisible()
}
/** Use canonical search without replacing the originating launchpad selection. */
async function roles(page: Page): Promise<void> {
	if (!(await page.getByRole('textbox', { name: 'Search applications', exact: true }).isVisible()))
		await page.getByRole('button', { name: 'Search', exact: true }).click()
	await page
		.getByRole('textbox', { name: 'Search applications', exact: true })
		.fill('ROLE_MANAGEMENT')
	await page.getByRole('button', { name: 'Role Management — Available', exact: true }).click()
	await expect(page.getByRole('grid', { name: 'Tenant roles' })).toBeVisible()
}

test('native settings persist presentation and protect notification drafts', /** Reuse the real preference editor and test only changed controls, without Storybook or a theme matrix. */ async ({
	page,
}) => {
	await page.goto('/')
	await settings(page)
	const dialog = page.locator('ui5-user-settings-dialog')
	await expect(
		dialog.getByText('jim.halpert@dundermifflin.example', { exact: true }).last(),
	).toBeVisible()
	await dialog.getByRole('listitem', { name: /^Appearance/ }).click()
	await page.getByRole('combobox', { name: 'Theme', exact: true }).click()
	await page.getByRole('option', { name: 'HER Dark', exact: true }).click()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'her-dark')
	await dialog.getByRole('listitem', { name: /^Language & Region/ }).click()
	await page.getByRole('combobox', { name: 'Time format', exact: true }).click()
	await page.getByRole('option', { name: '12-hour', exact: true }).click()
	await dialog.getByRole('listitem', { name: /^Notifications/ }).click()
	const checkbox = dialog.getByRole('checkbox').first()
	await expect(checkbox).toBeVisible()
	const checked = await checkbox.isChecked()
	await checkbox.click()
	await dialog.getByRole('button', { name: 'Close', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Discard changes?', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
	await expect(checkbox).toBeChecked({ checked: !checked })
	await dialog.getByRole('button', { name: 'Close', exact: true }).click()
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
	await expect(page.locator('ef-hcm-settings')).toHaveCount(0)
	await page.reload()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'her-dark')
	await settings(page)
	await page
		.locator('ui5-user-settings-dialog')
		.getByRole('listitem', { name: /^Language & Region/ })
		.click()
	await expect(page.getByRole('combobox', { name: 'Time format', exact: true })).toContainText(
		'12-hour',
	)
	await page.screenshot({ path: '.tmp/native-settings-region.png' })
})

test('native rows, filter grid, detail controls and back preserve the selected Space', /** Exercise pointer/keyboard navigation and phone detail controls against persisted roles. */ async ({
	page,
}) => {
	await page.goto('/')
	await administrator(page)
	await page.getByRole('tab', { name: 'Administration', exact: true }).click()
	await roles(page)
	await expect(
		page.locator('ui5-shellbar').getByRole('heading', { name: 'Role Management', exact: true }),
	).toBeVisible()
	const form = page.locator('ui5-form[hcmHeader]').first()
	await expect(form).toHaveAttribute('label-span', 'S12 M12 L12 XL12')
	const label = await form.locator('ui5-label').first().boundingBox(),
		input = await page.getByRole('searchbox', { name: 'Search role names' }).boundingBox()
	expect(input!.y).toBeGreaterThan(label!.y)
	const row = page.getByRole('row').filter({ hasText: 'Tenant Administrator' }).first()
	await row.click()
	const detail = page.locator('ef-hcm-role-detail')
	await expect(detail.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible()
	await expect(detail.locator('ui5-form')).toBeVisible()
	await detail.getByRole('button', { name: 'Maximize detail', exact: true }).click()
	await expect(page.locator('ui5-flexible-column-layout')).toHaveAttribute(
		'layout',
		'MidColumnFullScreen',
	)
	await detail.getByRole('button', { name: 'Minimize detail', exact: true }).click()
	await expect(page.locator('ui5-flexible-column-layout')).toHaveAttribute(
		'layout',
		'TwoColumnsMidExpanded',
	)
	await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
	await expect(detail).toHaveCount(0)
	await row.focus()
	await page.keyboard.press('Enter')
	await expect(detail).toBeVisible()
	await page.setViewportSize({ width: 390, height: 844 })
	await expect(detail.getByRole('button', { name: 'Close detail', exact: true })).toBeVisible()
	await page.screenshot({ path: '.tmp/native-role-phone.png' })
	await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.getByRole('button', { name: 'Back to launchpad', exact: true }).click()
	await expect(page.getByRole('tab', { name: 'Administration', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
	await roles(page)
	await page.goBack()
	await expect(page.getByRole('tab', { name: 'Administration', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
})

test('notification tray shares real inbox content and local sign-out survives reload', /** Verify native tray/product controls and explicit local re-entry without adding production auth. */ async ({
	page,
}) => {
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
	const response = page.waitForResponse(
		/** Match the tray read, excluding the separate unread badge projection. */ (res) =>
			res.url().includes('/notifications/me/inbox') && res.url().includes('unread=true'),
	)
	await page.locator('ui5-shellbar [data-ui5-stable="notifications"]').click()
	const inbox = await (await response).json()
	const tray = page.locator('ui5-popover[header-text="Notifications"]')
	await expect(tray.locator('ui5-notification-list')).toBeVisible()
	await expect(tray.locator('ui5-li-notification')).toHaveCount(inbox.items.length)
	if (inbox.items.length)
		await expect(tray.locator('ui5-li-notification').first()).toHaveAttribute(
			'title-text',
			inbox.items[0].title,
		)
	await page.screenshot({ path: '.tmp/native-notifications.png' })
	await page.getByRole('button', { name: 'Open My Notifications', exact: true }).click()
	await expect(page.locator('ef-hcm-my-notifications ui5-notification-list')).toBeVisible()
	await page.getByRole('button', { name: 'Products', exact: true }).click()
	await expect(page.locator('ui5-product-switch')).toBeVisible()
	await expect(page.locator('ui5-product-switch-item')).toHaveCount(3)
	await page.keyboard.press('Escape')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'Enter development workspace', exact: true }),
	).toBeVisible()
	await page.reload()
	await expect(
		page.getByRole('button', { name: 'Enter development workspace', exact: true }),
	).toBeVisible()
	await page.getByRole('button', { name: 'Enter development workspace', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
})
