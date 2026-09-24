import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const origin = process.env['HCM_STORYBOOK_URL'] ?? 'http://localhost:6006'
const output = '.tmp/hcm-workshop'
const proofs = [
	{ id: 'floorplans-native-dynamic-page--content', selector: 'ef-hcm-dynamic-page' },
	{ id: 'floorplans-composed-object-page--content', selector: 'ef-hcm-object-page' },
]
const themes = ['horizon-light', 'horizon-dark', 'her-light', 'her-dark']
const response = await fetch(`${origin}/index.json`)
assert.ok(response.ok, 'Start HCM Storybook before verification.')
const index = await response.json()
for (const proof of proofs)
	assert.ok(
		index.entries[proof.id],
		'Both production floorplans must be present in the Storybook index.',
	)
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const errors = []
const results = []
const accessibility = []
page.on(
	'response',
	/** Treat missing local assets as integration failures rather than accepting font fallbacks. */ (
		response,
	) => {
		if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`)
	},
)
page.on(
	'pageerror',
	/** Collect runtime failures across all native integrations. */ (error) =>
		errors.push(error.message),
)
await context.route(
	'**/*',
	/** Keep proof fixtures independent of product APIs and external assets. */ async (route) => {
		const url = new URL(route.request().url())
		if (url.origin !== origin || url.pathname.startsWith('/api/')) {
			errors.push(`Unexpected request: ${url.origin}${url.pathname}`)
			await route.abort()
		} else await route.continue()
	},
)

try {
	for (const proof of proofs) {
		for (const theme of themes) {
			for (const [width, height] of [
				[1440, 960],
				[768, 1024],
				[390, 844],
			]) {
				await page.setViewportSize({ width, height })
				const globals = `theme:${theme};brand:amethyst;density:${width === 768 ? 'compact' : 'cozy'}`
				await page.goto(
					`${origin}/iframe.html?id=${proof.id}&viewMode=story&globals=${encodeURIComponent(globals)}`,
				)
				await page.locator(proof.selector).waitFor()
				await settled(page, theme)
				const state = await page.evaluate(
					/** Read the production semantic overlay and outer document bounds. */ () => ({
						accent: getComputedStyle(document.documentElement)
							.getPropertyValue('--ef-color-accent')
							.trim(),
						overflow: document.documentElement.scrollWidth - innerWidth,
						renderError: document.body.classList.contains('sb-show-errordisplay'),
					}),
				)
				assert.equal(state.accent, '#7a4de8')
				assert.ok(state.overflow <= 2, `${proof.id}/${theme}/${width}: overflow`)
				assert.equal(state.renderError, false)
				const audit = await new AxeBuilder({ page }).include(proof.selector).analyze()
				accessibility.push({
					id: proof.id,
					theme,
					width,
					violations: audit.violations,
					incomplete: audit.incomplete,
				})
				await page.screenshot({
					path: `${output}/${proof.id}-${theme}-${width}.png`,
					fullPage: true,
				})
				results.push({ id: proof.id, theme, width, height, ...state })
			}
		}
		console.log(`Verified theme/layout cases: ${proof.id}`)
	}
	await writeFile(`${output}/accessibility.json`, `${JSON.stringify(accessibility, null, 2)}\n`)
	await nativeInteractions()
	await themeTransitions()
	assert.deepEqual(errors, [], 'No unhandled errors or non-local/API requests are allowed.')
	await writeFile(
		`${output}/results.json`,
		`${JSON.stringify({ cases: results, interactions: 'passed', transitions: 'passed', errors }, null, 2)}\n`,
	)
	await writeFile(`${output}/accessibility.json`, `${JSON.stringify(accessibility, null, 2)}\n`)
	const failing = accessibility.filter(
		/** Preserve every finding without suppressing upstream rules. */ (item) =>
			item.violations.length,
	)
	console.log(
		`Passed ${results.length} theme/viewport cases, native interactions and in-place theme transitions.`,
	)
	console.log(
		`Accessibility: ${failing.length} cases have findings. Full evidence: ${output}/accessibility.json`,
	)
	if (failing.length) process.exitCode = 1
} catch (error) {
	await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
	console.error({ url: page.url(), errors })
	throw error
} finally {
	await browser.close()
}

/** Wait for both native loaders and the semantic palette before inspecting the requested theme. */
async function settled(target, theme) {
	await target.waitForFunction(
		/** Observe the public applied-state marker rather than requested controls. */ (variant) =>
			document.documentElement.dataset.hcmThemeVariant === variant &&
			!document.documentElement.dataset.hcmThemeLoading,
		theme,
	)
	await target.waitForLoadState('networkidle')
}

/** Exercise real collapse/pin, search, section navigation, edit availability and phone overflow. */
async function nativeInteractions() {
	await page.setViewportSize({ width: 1440, height: 960 })
	await page.goto(`${origin}/iframe.html?id=${proofs[0].id}&viewMode=story`)
	await settled(page, 'horizon-light')
	await page.getByRole('button', { name: 'Collapse Header', exact: true }).click()
	await expect(page.locator('ui5-dynamic-page')).toHaveJSProperty('headerSnapped', true)
	await page.getByRole('button', { name: 'Expand Header', exact: true }).click()
	await page.getByRole('button', { name: 'Pin Header', exact: true }).click()
	await expect(page.locator('ui5-dynamic-page')).toHaveJSProperty('headerPinned', true)
	await page.getByRole('searchbox', { name: 'Search employees' }).fill('Alex')
	await expect(page.getByRole('heading', { name: 'Employees (4)', exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Employees (32)', exact: true })).toBeVisible()
	await page.goto(`${origin}/iframe.html?id=${proofs[1].id}&viewMode=story`)
	await settled(page, 'horizon-light')
	const history = page.getByRole('tab', { name: 'History', exact: true })
	await history.click()
	await expect(history).toHaveAttribute('aria-selected', 'true')
	await expect(page.getByRole('grid', { name: 'Employment history' })).toBeInViewport()
	await history.press('ArrowLeft')
	await expect(page.getByRole('tab', { name: 'Employment', exact: true })).toBeFocused()
	await page.getByRole('tab', { name: 'Employment', exact: true }).press('Enter')
	await expect(page.locator('#profile-job')).toHaveJSProperty('readonly', true)
	await page.getByRole('button', { name: 'Edit preview', exact: true }).click()
	await expect(page.locator('#profile-job')).toHaveJSProperty('readonly', false)
	await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Preview role')
	await page.getByRole('button', { name: 'Save preview', exact: true }).click()
	await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue(
		'Preview role',
	)
	assert.deepEqual(
		(await new AxeBuilder({ page }).include('ef-hcm-object-page').analyze()).violations,
		[],
	)
	await expect(page.locator('#profile-job')).toHaveJSProperty('readonly', true)
	await page.setViewportSize({ width: 390, height: 844 })
	await page
		.locator('ui5-toolbar')
		.getByRole('button', { name: 'Additional Options', exact: true })
		.click()
	await page.getByRole('button', { name: 'Show reference', exact: true }).click()
	await expect(page.getByText('Employee reference: DEMO-042.', { exact: true })).toBeVisible()
}

/** Switch Storybook toolbar globals without reloading the iframe and verify every inline bridge is removed. */
async function themeTransitions() {
	await page.setViewportSize({ width: 1440, height: 960 })
	await page.goto(`${origin}/?path=/story/${proofs[0].id}`)
	const iframe = page.frameLocator('#storybook-preview-iframe')
	await iframe.locator('ef-hcm-dynamic-page').waitFor()
	const frame = page
		.frames()
		.find(
			/** Find the live preview without relying on Storybook private globals. */ (item) =>
				item.url().includes('/iframe.html'),
		)
	assert.ok(frame)
	await settled(frame, 'horizon-light')
	await page.getByRole('button', { name: /^Content density / }).click()
	await page.getByRole('option', { name: 'cozy', exact: true }).click()
	await expect(frame.locator('ef-hcm-story-frame')).not.toHaveClass(/ui5-content-density-compact/)
	const baseline = await palette(frame)
	const input = frame.locator('ui5-input').first()
	const cozyHeight = await input.evaluate(
		/** Measure a rendered native control before density changes. */ (element) =>
			element.getBoundingClientRect().height,
	)
	await page.getByRole('button', { name: /^Content density / }).click()
	await page.getByRole('option', { name: 'compact', exact: true }).click()
	await expect
		.poll(
			/** Verify the toolbar changes actual UI5 sizing, not just its selected label. */ () =>
				input.evaluate(
					/** Read the native host's rendered height. */ (element) =>
						element.getBoundingClientRect().height,
				),
		)
		.toBeLessThan(cozyHeight)
	await page.getByRole('button', { name: /^Content density / }).click()
	await page.getByRole('option', { name: 'cozy', exact: true }).click()
	await expect
		.poll(
			/** Verify removing Compact restores the original native control dimensions. */ () =>
				input.evaluate(
					/** Read the native host after restoration. */ (element) =>
						element.getBoundingClientRect().height,
				),
		)
		.toBe(cozyHeight)
	await page.getByRole('button', { name: /^Tenant accent / }).click()
	await page.getByRole('option', { name: 'Amethyst', exact: true }).click()
	for (const [label, value] of [
		['HER Dark', 'her-dark'],
		['HER Light', 'her-light'],
		['Horizon Dark', 'horizon-dark'],
		['Horizon Light', 'horizon-light'],
	]) {
		await page.getByRole('button', { name: /^HCM theme / }).click()
		await page.getByRole('option', { name: label, exact: true }).click()
		await settled(frame, value)
		assert.equal((await palette(frame)).accent, '#7a4de8')
	}
	await page.getByRole('button', { name: /^Tenant accent / }).click()
	await page.getByRole('option', { name: 'No tenant override', exact: true }).click()
	await expect
		.poll(
			/** Await semantic cleanup after the last controlled overlay change. */ () => palette(frame),
		)
		.toEqual(baseline)
}

/** Capture computed public tokens plus the complete inline style set to detect stale family or branding values. */
async function palette(frame) {
	return frame.evaluate(
		/** Inspect only the document-level production theme contract. */ () => ({
			accent: getComputedStyle(document.documentElement)
				.getPropertyValue('--ef-color-accent')
				.trim(),
			background: getComputedStyle(document.documentElement)
				.getPropertyValue('--sapBackgroundColor')
				.trim(),
			inline: document.documentElement.getAttribute('style'),
			family: document.documentElement.dataset.hcmThemeFamily,
		}),
	)
}
