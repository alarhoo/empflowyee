import { test, expect } from '@playwright/test'

test('switches all four themes across all floorplan previews', /** Verify native UI5 colors and semantic surfaces, not just button selection. */ async ({
	page,
}) => {
	// This scenario loads two native asset families and renders sixteen preview combinations.
	test.setTimeout(60000)
	const errors: string[] = []
	page.on(
		'pageerror',
		/** Collect unhandled runtime failures during theme asset changes. */ (error) =>
			errors.push(error.message),
	)
	await page.goto('/ux/theme-lab')
	await expect(page.getByRole('heading', { name: 'Theme Lab', exact: true })).toBeVisible()
	const variants = [
		{ label: 'Horizon Light', id: 'horizon-light', dark: false },
		{ label: 'Horizon Dark', id: 'horizon-dark', dark: true },
		{ label: 'HER Light', id: 'her-light', dark: false },
		{ label: 'HER Dark', id: 'her-dark', dark: true },
	]
	const previews = [
		{ label: 'Overview', region: 'Overview floorplan preview' },
		{ label: 'Object Page', region: 'Object Page floorplan preview' },
		{ label: 'Flexible Columns', region: 'Flexible Column Layout preview' },
		{ label: 'Table + Form', region: 'Enterprise table and form preview' },
	]
	const nativeBackgrounds: string[] = []
	const surfaces: string[] = []
	for (const variant of variants) {
		await page.getByRole('button', { name: variant.label, exact: true }).click()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', variant.id)
		await expect(page.locator('html')).toHaveCSS('color-scheme', variant.dark ? 'dark' : 'light')
		surfaces.push(
			await page
				.locator('body')
				.evaluate(
					/** Read the actual page surface after the theme applies. */ (element) =>
						getComputedStyle(element).backgroundColor,
				),
		)
		nativeBackgrounds.push(
			await page
				.locator('html')
				.evaluate(
					/** Read a native SAP background parameter unaffected by the accent bridge. */ (
						element,
					) => getComputedStyle(element).getPropertyValue('--sapBackgroundColor').trim(),
				),
		)
		for (const preview of previews) {
			await page.getByRole('button', { name: preview.label, exact: true }).click()
			await expect(page.getByRole('region', { name: preview.region, exact: true })).toBeVisible()
		}
	}
	expect(new Set(surfaces).size).toBe(4)
	expect(nativeBackgrounds[0]).not.toBe(nativeBackgrounds[1])
	expect(nativeBackgrounds[0]).toBe(nativeBackgrounds[2])
	expect(nativeBackgrounds[1]).toBe(nativeBackgrounds[3])
	expect(errors).toEqual([])
})

test('validates tenant branding and restores theme defaults', /** Reject CSS input and remove all bridge parameters when returning to unbranded Horizon. */ async ({
	page,
}) => {
	await page.goto('/ux/theme-lab')
	const hex = page.getByRole('textbox', { name: 'Tenant primary color hex', exact: true })
	await hex.fill('#0Af')
	await page.getByRole('button', { name: 'Apply color', exact: true }).click()
	await expect(hex).toHaveValue('#00aaff')
	await expect
		.poll(
			/** Wait for the asynchronous native theme and accent bridge. */ () =>
				page
					.locator('html')
					.evaluate(
						/** Read the public SAP emphasis background assigned by the bridge. */ (root) =>
							root.style.getPropertyValue('--sapButton_Emphasized_Background'),
					),
		)
		.toBe('#00aaff')
	await hex.fill('red; background:url(x)')
	await page.getByRole('button', { name: 'Apply color', exact: true }).click()
	await expect(page.getByRole('alert').filter({ hasText: 'three- or six-digit' })).toBeVisible()
	await expect(hex).toHaveAttribute('aria-invalid', 'true')
	await page.getByRole('button', { name: 'HER Dark', exact: true }).click()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'her-dark')
	await expect
		.poll(
			/** Confirm an invalid draft never replaces the accepted tenant color. */ () =>
				page
					.locator('html')
					.evaluate(
						/** Read the governed semantic accent. */ (root) =>
							root.style.getPropertyValue('--ef-color-accent'),
					),
		)
		.toBe('#00aaff')
	await page.getByRole('button', { name: 'Use theme default', exact: true }).click()
	await expect(hex).toHaveValue('')
	await page.getByRole('button', { name: 'Horizon Light', exact: true }).click()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'horizon-light')
	expect(
		await page
			.locator('html')
			.evaluate(
				/** Check both semantic and public SAP inline overrides were removed. */ (root) => [
					root.style.getPropertyValue('--ef-color-accent'),
					root.style.getPropertyValue('--sapBrandColor'),
					root.style.getPropertyValue('--sapButton_Emphasized_Background'),
				],
			),
	).toEqual(['', '', ''])
})

test('filters navigation when fixture roles and entitlements change', /** Prove commercial gates apply to the super admin and hidden Spaces lose their selection. */ async ({
	page,
}) => {
	await page.goto('/ux/theme-lab')
	await page.getByRole('button', { name: 'Administration', exact: true }).click()
	const catalog = page.getByRole('region', { name: 'Application catalog' })
	await expect(catalog.getByText('Tenant Configuration', { exact: true })).toBeVisible()
	await page.locator('summary').click()
	const administration = page.getByRole('checkbox', { name: 'administration', exact: true })
	await expect(administration).toBeChecked()
	await administration.click()
	await expect(administration).not.toBeChecked()
	await expect(catalog.getByText('Tenant Configuration', { exact: true })).toHaveCount(0)
	await expect(catalog.getByRole('link', { name: 'Theme Lab', exact: true })).toBeVisible()
	// UI5 updates its shadow ARIA state asynchronously; wait for the observable state after the click.
	const superAdmin = page.getByRole('checkbox', { name: 'tenant-super-admin', exact: true })
	await expect(superAdmin).toBeChecked()
	await superAdmin.click()
	await expect(superAdmin).not.toBeChecked()
	const spaces = page.getByRole('navigation', { name: 'HCM spaces', exact: true })
	await expect(spaces.getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0)
	await expect(page.getByRole('heading', { name: 'Theme Lab', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Reset demo session', exact: true }).click()
	await expect(spaces.getByRole('button', { name: 'Administration', exact: true })).toBeVisible()
})

test('keeps every preview usable on a narrow viewport', /** Detect horizontal page overflow while preserving scrollable table content. */ async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/ux/theme-lab')
	for (const label of ['Overview', 'Object Page', 'Flexible Columns', 'Table + Form']) {
		await page.getByRole('button', { name: label, exact: true }).click()
		const overflow = await page
			.locator('html')
			.evaluate(
				/** Measure page overflow, allowing overflow inside designated scroll containers. */ (
					root,
				) => root.scrollWidth - root.clientWidth,
			)
		expect(overflow).toBeLessThanOrEqual(1)
	}
})
