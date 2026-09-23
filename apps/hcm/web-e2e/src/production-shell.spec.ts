import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const discovery = {
	tenant: {
		slug: 'acme',
		displayName: 'Acme demo',
		status: 'active',
		allowUserTheme: true,
		primaryColor: '#6854a3',
		defaults: { theme: 'her-light', language: 'en', locale: 'en-IN', timezone: 'Asia/Kolkata' },
	},
	authentication: { strategies: [] },
}
const session = {
	tenant: discovery.tenant,
	user: { id: 'fictional-user', displayName: 'Alex Example' },
	access: {
		roles: ['employee'],
		permissions: ['employee.directory.read', 'hcm.catalogue.MY_PROFILE.discover'],
		entitlements: ['employee-core', 'hcm.employee'],
		featureFlags: ['shell-preview'],
	},
	preferences: {},
	session: { version: 'browser-test' },
}

/** Supply deterministic endpoint responses while exercising the production store, shell and router. */
async function runtime(
	page: Page,
	tenantStatus = 200,
	sessionStatus = 200,
	tenant = discovery,
	context = session,
): Promise<void> {
	await page.route(
		'**/api/v1/runtime/tenant',
		/** Keep pre-auth tests independent of backend persistence adapters. */ (route) =>
			route.fulfill({ status: tenantStatus, json: tenant }),
	)
	await page.route(
		'**/api/v1/runtime/session',
		/** Model only the HTTP output of a verified server session. */ (route) =>
			route.fulfill({ status: sessionStatus, json: context }),
	)
}

for (const scenario of [
	{ name: 'unknown', tenantStatus: 404, sessionStatus: 200, text: 'Tenant not found.' },
	{ name: 'auth-required', tenantStatus: 200, sessionStatus: 401, text: 'Sign in to continue' },
	{
		name: 'forbidden',
		tenantStatus: 200,
		sessionStatus: 403,
		text: 'Access denied for this tenant.',
	},
	{
		name: 'error',
		tenantStatus: 200,
		sessionStatus: 503,
		text: 'Your workspace could not be loaded.',
	},
]) {
	test(`renders ${scenario.name} as a distinct native page`, /** Verify a user-visible state rather than only a store discriminator. */ async ({
		page,
	}) => {
		await runtime(page, scenario.tenantStatus, scenario.sessionStatus)
		await page.goto('/')
		await expect(page.getByText(scenario.text, { exact: false })).toBeVisible()
		await expect(page.locator('ui5-page ui5-bar[slot="header"]')).toBeVisible()
	})
}

test('blocks suspended tenants without attempting session bootstrap', /** Ensure disabled lifecycle state prevents feature routing and privileged requests. */ async ({
	page,
}) => {
	let sessionRequests = 0
	await runtime(page, 200, 200, {
		...discovery,
		tenant: { ...discovery.tenant, status: 'suspended' },
	})
	page.on(
		'request',
		/** Count any accidental authenticated bootstrap request. */ (request) => {
			if (request.url().endsWith('/runtime/session')) sessionRequests++
		},
	)
	await page.goto('/workspace')
	await expect(
		page.getByText('This tenant is suspended or deactivated.', { exact: false }),
	).toBeVisible()
	expect(sessionRequests).toBe(0)
})

test('gates direct lazy navigation with the same catalog policy', /** Check forbidden deep links and authorized native navigation through the actual app routes. */ async ({
	page,
}) => {
	await runtime(page, 200, 200, discovery, {
		...session,
		access: { ...session.access, permissions: [] },
	})
	await page.goto('/workspace')
	await expect(page).toHaveURL(/\/access-denied$/)
	await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
	await page.unroute('**/api/v1/runtime/session')
	await page.route(
		'**/api/v1/runtime/session',
		/** Restore authorized capabilities for a fresh authenticated bootstrap. */ (route) =>
			route.fulfill({ json: session }),
	)
	await page.goto('/')
	await page.goto('/workspace')
	await expect(page).toHaveURL(/\/workspace$/)
	await expect(page.getByRole('heading', { name: 'Workspace preview' })).toBeVisible()
})

for (const theme of ['horizon-light', 'horizon-dark', 'her-light', 'her-dark'] as const) {
	test(`applies ${theme}, tenant branding, responsive canvas and accessible native controls`, /** Exercise the production presentation projection at wide and phone widths. */ async ({
		page,
	}) => {
		await runtime(page, 200, 200, discovery, {
			...session,
			preferences: { theme, language: 'en', density: 'compact' },
		})
		await page.goto('/')
		await expect(
			page.getByRole('button', { name: 'My Profile — Planned', exact: true }),
		).toBeVisible()
		await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', theme)
		await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
		await expect(page.locator('html')).toHaveAttribute('lang', 'en')
		for (const width of [2560, 1440, 768, 390]) {
			await page.setViewportSize({ width, height: 900 })
			const shell = await page.locator('ui5-shellbar').boundingBox()
			expect(shell?.width).toBe(width)
			const box = await page.locator('.hcm-launchpad-content').boundingBox()
			expect(box?.width).toBeLessThanOrEqual(1440)
			expect(
				await page.evaluate(
					/** Compare content width with viewport to catch unintended horizontal scrolling. */ () =>
						document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
		}
		const accessibility = await new AxeBuilder({ page }).analyze()
		expect(accessibility.violations).toEqual([])
		await page.screenshot({ path: `.tmp/hcm-production-shell/${theme}-phone.png`, fullPage: true })
	})
}

test('replaces pre-auth HER with user Horizon and removes the tenant accent without reload', /** Retry after authentication and ensure no pre-auth palette leaks into a different tenant overlay selection. */ async ({
	page,
}) => {
	await runtime(page, 200, 401)
	await page.goto('/')
	await expect(page.getByText('Sign in to continue', { exact: false })).toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'her-light')
	await page.unroute('**/api/v1/runtime/session')
	await page.route(
		'**/api/v1/runtime/session',
		/** Return authenticated user preference and authoritative updated branding. */ (route) =>
			route.fulfill({
				json: {
					...session,
					tenant: { ...session.tenant, primaryColor: undefined },
					preferences: { theme: 'horizon-dark' },
				},
			}),
	)
	await page.getByRole('button', { name: 'Try again', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'My Profile — Planned', exact: true }),
	).toBeVisible()
	await expect(page.locator('html')).toHaveAttribute('data-hcm-theme-variant', 'horizon-dark')
	await expect(page.locator('html')).not.toHaveAttribute('data-hcm-theme-loading', 'true')
	expect(
		await page.evaluate(
			/** Check owned inline bridge variables after Horizon restoration. */ () => ({
				accent: document.documentElement.style.getPropertyValue('--sapBrandColor'),
				surface: document.documentElement.style.getPropertyValue('--sapBackgroundColor'),
			}),
		),
	).toEqual({ accent: '', surface: '' })
})
