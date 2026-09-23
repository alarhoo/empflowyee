import { test, expect, type Page } from '@playwright/test'

test.setTimeout(60000)

/** Open the real application and wait for both native theme layers to settle. */
async function openLab(page: Page): Promise<void> {
	await page.goto('/ux/theme-lab')
	await expect(page.getByRole('button', { name: 'Explore demo', exact: true })).toBeVisible({
		timeout: 30000,
	})
	await expect(page.getByText('One theme engine, native controls', { exact: true })).toBeVisible()
	await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true', {
		timeout: 20000,
	})
}

/** Select a maintained UI5 Select option through its keyboard-accessible popup. */
async function select(page: Page, label: string, value: string): Promise<void> {
	const control = page.getByRole('combobox', { name: label, exact: true })
	await control.scrollIntoViewIfNeeded()
	await control.focus()
	await control.press('Space')
	await page.getByRole('option', { name: value, exact: true }).click()
}

/** Open a fictional employee through the real list and FCL interaction. */
async function openEmployee(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'Demo', exact: true }).click()
	await page
		.locator('ui5-list[accessible-name="Employee directory"] ui5-li-custom')
		.filter({ hasText: 'Jim Halpert' })
		.click()
	await expect(page.locator('ui5-flexible-column-layout')).toHaveAttribute(
		'layout',
		'TwoColumnsMidExpanded',
	)
	await expect(
		page.getByRole('heading', { name: 'Jim Halpert', exact: true }).first(),
	).toBeVisible()
}

test('uses native Employee, Leave and Project drill-downs with local profile edits', /** Verify the main workflow without domain API calls. */ async ({
	page,
}) => {
	await openLab(page)
	await openEmployee(page)
	await expect(page.locator('ef-hcm-tool-page-layout ui5-navigation-layout')).toBeVisible()
	await expect(page.locator('ef-hcm-object-page ui5-dynamic-page')).toBeVisible()
	await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
	await page.getByRole('textbox', { name: 'Preferred name', exact: true }).fill('Jimmy')
	await page.getByRole('button', { name: 'Save preview', exact: true }).click()
	await expect(page.getByText('Jimmy', { exact: true })).toBeVisible()
	await page.locator('ui5-side-navigation-item[text="Leave"]').click()
	await page
		.locator('ui5-list[accessible-name="Leave requests"] ui5-li')
		.filter({ hasText: 'Pam Beesly' })
		.click()
	await expect(page.getByRole('heading', { name: 'Pam Beesly' })).toBeVisible()
	await page.getByRole('button', { name: 'Approval history', exact: true }).click()
	await expect(page.locator('ui5-flexible-column-layout')).toHaveAttribute(
		'layout',
		'ThreeColumnsEndExpanded',
	)
	await expect(page.getByRole('heading', { name: 'Approval history' })).toBeVisible()
	await page.getByRole('button', { name: 'Close context' }).click()
	await page.locator('ui5-side-navigation-item[text="Projects"]').click()
	await page
		.locator('ui5-list[accessible-name="Projects"] ui5-li')
		.filter({ hasText: 'Customer onboarding' })
		.click()
	await expect(page.locator('ui5-table[accessible-name="Project assignments"]')).toBeVisible()
})

test('applies all four themes to native controls and supports responsive FCL', /** Inspect actual native form backgrounds and logical columns at three viewport sizes. */ async ({
	page,
}) => {
	const errors: string[] = []
	page.on(
		'console',
		/** Capture Angular-reported native rendering failures as well as uncaught errors. */ (
			message,
		) => {
			if (message.type() === 'error') errors.push(message.text())
		},
	)
	page.on(
		'pageerror',
		/** Retain unexpected application failures. */ (error) => errors.push(error.message),
	)
	await openLab(page)
	await openEmployee(page)
	for (const [label, id, background] of [
		['HER Light', 'her-light', 'rgb(255, 249, 242)'],
		['HER Dark', 'her-dark', 'rgb(48, 38, 38)'],
		['Horizon Dark', 'horizon-dark', ''],
		['Horizon Light', 'horizon-light', ''],
	]) {
		await page.getByRole('button', { name: 'Developer profile' }).click()
		await page.locator(`ui5-menu-item[text="${label}"]`).click()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', id, {
			timeout: 20000,
		})
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true', {
			timeout: 20000,
		})
		await expect(page.getByRole('tab', { name: 'Demo', exact: true })).toHaveAttribute(
			'aria-selected',
			'true',
		)
		if (background)
			await expect(
				page.locator('ef-hcm-lab-profile ui5-form').first().locator('.ui5-form-root'),
			).toHaveCSS('background-color', background)
		else
			expect(
				await page
					.locator('html')
					.evaluate(
						/** Assert all runtime palette ownership is released on unbranded Horizon. */ (root) =>
							root.getAttribute('style'),
					),
			).toBe('color-scheme: ' + (id.endsWith('dark') ? 'dark' : 'light') + ';')
		await page.screenshot({ path: `.tmp/foundation-${id}.png`, fullPage: true })
	}
	for (const width of [2560, 1440, 768, 390]) {
		await page.setViewportSize({ width, height: 1000 })
		const canvas = await page.locator('ef-hcm-root').boundingBox()
		expect(canvas).not.toBeNull()
		expect(canvas?.width).toBeLessThanOrEqual(1440)
		expect(canvas?.x).toBeGreaterThan(0)
		expect(Math.abs((canvas?.x ?? 0) * 2 + (canvas?.width ?? 0) - width)).toBeLessThanOrEqual(1)
		if (width === 390) await expect(page.locator('ui5-side-navigation')).not.toBeInViewport()
		await expect(
			page.getByRole('heading', { name: 'Jim Halpert', exact: true }).first(),
		).toBeVisible()
		expect(
			await page
				.locator('html')
				.evaluate(
					/** Detect document overflow without forbidding native internal scrolling. */ (root) =>
						root.scrollWidth - root.clientWidth,
				),
		).toBeLessThanOrEqual(1)
		await page.screenshot({ path: `.tmp/foundation-width-${width}.png`, fullPage: true })
	}
	expect(errors).toEqual([])
})

test('validates token imports, resets defaults and removes HER overrides on Horizon', /** Exercise the settings UI and observe the production theme service's DOM contract. */ async ({
	page,
}) => {
	await openLab(page)
	await page.getByRole('tab', { name: 'Settings', exact: true }).click()
	await select(page, 'Theme preset', 'HER Light')
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'her-light')
	const surface = page.getByRole('textbox', { name: '--ef-surface-base', exact: true })
	await surface.fill('#ffffff')
	await surface.press('Tab')
	await expect
		.poll(
			/** Observe the native UI5 surface after a validated token change. */ () =>
				page
					.locator('html')
					.evaluate(
						/** Read the public SAP parameter. */ (root) =>
							root.style.getPropertyValue('--sapGroup_ContentBackground'),
					),
		)
		.toBe('#ffffff')
	await page.getByRole('button', { name: 'Import JSON', exact: true }).click()
	const json = page.getByRole('textbox', { name: 'Theme JSON', exact: true })
	await json.fill('{"schemaVersion":2,"base":"her-light","tenantPrimary":null,"tokens":{}}')
	await page.getByRole('button', { name: 'Apply JSON', exact: true }).click()
	await expect(page.getByRole('dialog')).toBeVisible()
	await json.fill(
		'{"schemaVersion":1,"base":"her-dark","tenantPrimary":"#663399","tokens":{"--ef-text-strong":"#302626"}}',
	)
	await page.getByRole('button', { name: 'Apply JSON', exact: true }).click()
	await expect(page.getByRole('dialog')).not.toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'her-dark', {
		timeout: 20000,
	})
	await expect(page.locator('ef-hcm-lab-settings').getByText(/Contrast warning:/)).toBeVisible()
	const accentButton = page.getByRole('button', { name: 'Apply accent', exact: true })
	await expect(page.locator('html')).toHaveAttribute('data-ui5-compact-size', '')
	const compactHeight = (await accentButton.boundingBox())?.height ?? 0
	await page.getByRole('switch', { name: 'Compact density', exact: true }).click()
	await expect
		.poll(
			/** Verify actual native geometry responds to the supported compact marker. */ async () =>
				(await accentButton.boundingBox())?.height ?? 0,
		)
		.toBeGreaterThan(compactHeight)
	await page.getByRole('switch', { name: 'Right-to-left', exact: true }).click()
	await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
	await page.screenshot({ path: '.tmp/foundation-settings-rtl.png' })
	await page.getByRole('switch', { name: 'Right-to-left', exact: true }).click()
	await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
	await expect(json).toHaveValue(/"schemaVersion": 1/)
	const download = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Download JSON', exact: true }).click()
	expect((await download).suggestedFilename()).toBe('empflowyee-her-theme.json')
	await page.getByRole('button', { name: 'Close', exact: true }).click()
	await page.getByRole('button', { name: 'Reset HER defaults', exact: true }).click()
	await page.getByRole('button', { name: 'Reset tenant override', exact: true }).click()
	await select(page, 'Theme preset', 'Horizon Light')
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'horizon-light')
	expect(
		await page
			.locator('html')
			.evaluate(
				/** Confirm both palette layers have released inline styles. */ (root) =>
					root.getAttribute('style'),
			),
	).toBe('color-scheme: light;')
})

test('disables the lazy lab in PROD and when explicitly disabled', /** The route gate must evaluate validated runtime configuration before loading lab UI. */ async ({
	page,
}) => {
	for (const config of [
		{ environment: 'prod' },
		{ environment: 'local', hcmThemeLabEnabled: false },
	]) {
		await page.route(
			'**/assets/config.json',
			/** Supply an isolated runtime configuration without changing deployment files. */ (route) =>
				route.fulfill({
					json: { ...config, releaseId: 'test', apiBaseUrl: '/api' },
				}),
		)
		await page.goto('/ux/theme-lab')
		await expect(page).toHaveURL(/\/$/)
		await expect(page.locator('ef-hcm-theme-lab')).toHaveCount(0)
		await page.unroute('**/assets/config.json')
	}
})
