import { expect, type Page } from '@playwright/test'
/**
 * Open the native application search only if responsive shell behavior has not already expanded it.
 * Waits for the rendered shellbar first: its Search button toggles, so clicking before the field
 * renders expanded would collapse it.
 */
export async function openApplicationSearch(page: Page): Promise<void> {
	const field = page.getByRole('textbox', { name: 'Search applications', exact: true }),
		toggle = page.getByRole('button', { name: 'Search', exact: true })
	await toggle.waitFor()
	await expect(
		/** Converge on the expanded field without toggling it closed. */ async () => {
			if (!(await field.isVisible())) await toggle.click()
			await expect(field).toBeVisible({ timeout: 1000 })
		},
	).toPass({ timeout: 15000 })
}
/** Select an appearance through the new native Settings dialog, preserving older acceptance assertions. */
export async function selectAppearance(page: Page, label: string): Promise<void> {
	await page.locator('ui5-shellbar [data-profile-btn]').click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	const dialog = page.locator('ui5-user-settings-dialog')
	await dialog.getByRole('listitem', { name: /^Appearance/ }).click()
	await dialog.getByRole('combobox', { name: 'Theme', exact: true }).click()
	await page.getByRole('option', { name: label, exact: true }).click()
	await dialog.getByRole('button', { name: 'Close', exact: true }).click()
	await expect(dialog).toHaveCount(0)
}
