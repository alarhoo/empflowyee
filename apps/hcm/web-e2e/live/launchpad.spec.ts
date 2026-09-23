import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogue = JSON.parse(readFileSync(resolve('docs/hcm/catalogue/hcm-launchpad.json'), 'utf8'))
const apps = JSON.parse(readFileSync(resolve('docs/hcm/catalogue/hcm-app-catalogue.json'), 'utf8'))

test('offers and persists all four themes, then resumes device appearance', /** Verify the native appearance menu controls both theme family and mode without narrowing the full-width shell. */ async ({
	page,
}) => {
	await page.setViewportSize({ width: 1920, height: 1200 })
	await page.emulateMedia({ colorScheme: 'light' })
	await page.goto('/')
	await expect(page.locator('.hcm-launchpad-content')).toBeVisible()
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
		await page.reload()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		await expect(page.locator('.hcm-launchpad-content')).toBeVisible()
		const colors = await page.evaluate(
			/** Verify actual native palette colors, not just a preference marker. */ () => ({
				text: getComputedStyle(document.querySelector('fd-tile h3')!).color,
				surface: getComputedStyle(document.querySelector('ui5-shellbar')!).backgroundColor,
			}),
		)
		const textChannel = Number(colors.text.match(/[\d.]+/)?.[0])
		const surfaceChannel = Number(colors.surface.match(/[\d.]+/)?.[0])
		if (variant.endsWith('-dark')) expect(textChannel).toBeGreaterThan(surfaceChannel)
		else expect(textChannel).toBeLessThan(surfaceChannel)
		await page.screenshot({ path: `.tmp/hcm-launchpad-browser/${variant}-wide.png` })
	}
	for (const width of [2560, 1920, 1440, 768, 390]) {
		await page.setViewportSize({ width, height: 1000 })
		const shell = await page.locator('ui5-shellbar').boundingBox()
		const landscape = await page.locator('.hcm-launchpad').boundingBox()
		const content = await page.locator('.hcm-launchpad-content').boundingBox()
		expect(shell?.width).toBe(width)
		expect(landscape?.width).toBe(width)
		expect((landscape?.y ?? 0) + (landscape?.height ?? 0)).toBe(1000)
		expect(content?.width).toBeLessThanOrEqual(1440)
		expect(Math.abs((content?.x ?? 0) - (width - (content?.width ?? 0)) / 2)).toBeLessThan(8)
	}
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.getByRole('button', { name: 'Appearance', exact: true }).click()
	await page.getByRole('menuitemradio', { name: 'Follow device' }).click()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'horizon-light')
	await page.emulateMedia({ colorScheme: 'dark' })
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'horizon-dark')
	await page.reload()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'horizon-dark')
})

for (const mode of ['light', 'dark'] as const) {
	test(`follows device ${mode} and persists a manual appearance across reloads`, /** Exercise native theme actions and the anchored profile surface through the real local session. */ async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: mode })
		await page.goto('/')
		await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', `horizon-${mode}`)
		const other = mode === 'light' ? 'dark' : 'light'
		await page.getByRole('button', { name: 'Appearance', exact: true }).click()
		await page
			.getByRole('menuitemradio', {
				name: `Horizon ${other === 'light' ? 'Light' : 'Dark'}`,
			})
			.click()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', `horizon-${other}`)
		await page.reload()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', `horizon-${other}`)
		await profile(page, 'Jim Halpert')
		await expect(page.getByText('jim.halpert@dundermifflin.example', { exact: true })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Workspace theme' })).toHaveCount(0)
		const menu = page.getByRole('dialog', { name: 'Your workspace' })
		const avatar = await page
			.getByRole('button', { name: 'Jim Halpert', exact: true })
			.boundingBox()
		const popup = await menu.boundingBox()
		expect(popup?.y).toBeGreaterThan(avatar?.y ?? 0)
		expect(popup?.width).toBeLessThan(400)
		await page.keyboard.press('Escape')
		await expect(menu).toBeHidden()
		await profile(page, 'Jim Halpert')
		await page.getByRole('heading', { name: 'My Overview', exact: true }).click()
		await expect(menu).toBeHidden()
	})
}

/** Open the current native profile menu using the real session identity. */
async function profile(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name, exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Your workspace' })).toBeVisible()
}

/** Select a native tab through its maintained overflow menu when the label cannot fit. */
async function selectPage(page: Page, title: string): Promise<void> {
	const tabs = page.locator('ui5-tabcontainer[aria-label="Space pages"]')
	const tab = tabs.getByRole('tab', { name: title, exact: true })
	if (await tab.isVisible()) await tab.click()
	else {
		await tabs.getByRole('button', { name: 'More', exact: true }).click()
		await page
			.locator('ui5-responsive-popover[open] ui5-li-custom')
			.filter({ hasText: title })
			.click()
	}
}

test('boots a real local tenant and inspects every catalogue placement', /** Verify metadata coverage through actual native navigation without intercepting runtime APIs. */ async ({
	page,
}) => {
	await page.setViewportSize({ width: 1920, height: 1080 })
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
	await expect(page.locator('ui5-tab[data-space]')).toHaveCount(1)
	await profile(page, 'Jim Halpert')
	await expect(page.getByText('jim.halpert@dundermifflin.example', { exact: true })).toBeVisible()
	await page.getByRole('checkbox', { name: 'Inspect all applications' }).click()
	await expect(page.getByRole('checkbox', { name: 'Inspect all applications' })).toBeChecked()
	await page.getByRole('button', { name: 'Done', exact: true }).click()
	await expect(page.locator('ui5-tab[data-space]')).toHaveCount(5)
	const visited = new Set<string>()
	let pageCount = 0
	for (const space of catalogue.spaces) {
		await page.getByRole('tab', { name: space.title, exact: true }).click()
		for (const pageId of space.pageIds) {
			const definition = catalogue.pages.find(
				/** Match the canonical page being traversed. */ (entry: { pageId: string }) =>
					entry.pageId === pageId,
			)
			await selectPage(page, definition.title)
			for (const group of definition.sections) {
				await expect(page.getByRole('region', { name: group.title, exact: true })).toBeVisible()
				for (const code of group.appCodes) {
					await expect(page.locator(`fd-tile[data-app-code="${code}"]`)).toHaveCount(1)
					visited.add(code)
				}
			}
			pageCount++
		}
	}
	expect(pageCount).toBe(20)
	expect([...visited].sort()).toEqual(
		apps.apps
			.map(
				/** Compare visible IDs with the complete canonical app inventory. */ (app: {
					appCode: string
				}) => app.appCode,
			)
			.sort(),
	)
	await page.getByRole('button', { name: 'Search', exact: true }).click()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('ACCESS_ASSIGNMENTS')
	await expect(
		page.getByRole('button', { name: 'Access Assignments — Planned', exact: true }),
	).toBeVisible()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('MY_PROFILE')
	await expect(page.locator('fd-tile')).toHaveCount(1)
	const tile = page.getByRole('button', { name: 'My Profile — Planned', exact: true })
	await tile.focus()
	await page.keyboard.press('Enter')
	await expect(page.getByRole('dialog', { name: 'My Profile', exact: true })).toBeVisible()
	await expect(
		page.getByText('Planned application. This capability has not been implemented yet.'),
	).toBeVisible()
	await page.getByRole('button', { name: 'Close', exact: true }).click()
	await expect(page).toHaveURL(/\/$/)
	await profile(page, 'Jim Halpert')
	await page.getByRole('checkbox', { name: 'Inspect all applications' }).click()
	await expect(page.getByRole('checkbox', { name: 'Inspect all applications' })).not.toBeChecked()
	await page.getByRole('button', { name: 'Done', exact: true }).click()
	await page.getByRole('textbox', { name: 'Search applications' }).fill('ACCESS_ASSIGNMENTS')
	await expect(page.getByRole('status')).toHaveText('No applications match your search.')
})

test('switches server personas and preserves responsive native navigation', /** Exercise the public session contract through profile controls and reject unauthorized deep links. */ async ({
	page,
}) => {
	await page.goto('/')
	let current = 'Jim Halpert'
	for (const persona of [
		{ name: 'Michael Scott', space: 'manager' },
		{ name: 'Toby Flenderson', space: 'hr-operations' },
		{ name: 'David Wallace', space: 'tenant-administration' },
		{ name: 'Jim Halpert', space: 'employee' },
	]) {
		await profile(page, current)
		await page.getByRole('combobox', { name: 'Development persona' }).click()
		await page.getByRole('option', { name: persona.name, exact: false }).click()
		await expect(page.getByRole('button', { name: persona.name, exact: true })).toBeVisible()
		await expect(page.locator(`ui5-tab[data-space="${persona.space}"]`)).toHaveCount(1)
		current = persona.name
	}
	for (const width of [2560, 1440, 768, 390]) {
		await page.setViewportSize({ width, height: 900 })
		expect(
			await page.evaluate(
				/** Detect overflow outside native scroll containers. */ () =>
					document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true)
	}
	await page.screenshot({ path: '.tmp/hcm-launchpad-browser/local-phone.png', fullPage: true })
	await page.goto('/workspace')
	await expect(page).toHaveURL(/\/access-denied$/)
})
