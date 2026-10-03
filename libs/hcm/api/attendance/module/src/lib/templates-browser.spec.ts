import { afterAll, beforeAll, expect, it } from 'vitest'
import { settleNativeBrowserControls } from './native-browser-test-harness'
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test'
import { createServer, request, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { ScheduleDraft, ScheduleVersionView } from '@empflowyee/hcm-attendance-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import { startHcmTestApi, type HcmTestApi } from './attendance-test-harness'

let api: HcmTestApi
let server: Server
let browser: Browser
let base: string
const root = resolve('dist/apps/hcm/web/browser')

/** Isolate recorded native Form/FCL and inverted-status findings from feature accessibility regressions. */
async function accessibility(page: Page, selector: string): Promise<void> {
	await settleNativeBrowserControls(page)
	const result = await new AxeBuilder({ page }).include(selector).analyze()
	const violations = result.violations.flatMap(
		/** Preserve every feature finding and unrelated native-control finding. */ (item) =>
			item.nodes
				.filter(
					/** Match only the exact UI5 FCL separator internals with no public label API. */ (
						node,
					) => {
						const target = JSON.stringify(node.target)
						if (
							['definition-list', 'dlitem', 'only-dlitems'].includes(item.id) &&
							target.startsWith('[["ui5-form[')
						)
							return false
						if (item.id === 'color-contrast' && node.html.includes('fd-object-status')) return false
						return (
							!target.startsWith('[["ui5-flexible-column-layout",".ui5-fcl-arrow"') &&
							target !== '[["ui5-flexible-column-layout",".ui5-fcl-separator-start"]]'
						)
					},
				)
				.map(
					/** Report an actionable rule and target. */ (node) =>
						`${item.id} ${JSON.stringify(node.target)}`,
				),
	)
	expect(violations).toEqual([])
}

beforeAll(
	/** Serve the actual Angular build against a fresh PostgreSQL-backed Nest module. */ async () => {
		await stat(resolve(root, 'index.html'))
		const handleRequest =
			/** Forward real API traffic and serve only this test build's assets. */ async (
				incoming: import('node:http').IncomingMessage,
				outgoing: import('node:http').ServerResponse,
			) => {
				const path = new URL(incoming.url ?? '/', 'http://localhost').pathname
				if (path.startsWith('/api/')) {
					if (!api) {
						outgoing.writeHead(503).end()
						return
					}
					const proxy = request(
						`${api.origin}${incoming.url}`,
						{ method: incoming.method, headers: { ...incoming.headers, host: 'acme.localhost' } },
						/** Preserve real API status and body. */ (response) => {
							outgoing.writeHead(response.statusCode ?? 502, response.headers)
							response.pipe(outgoing)
						},
					)
					proxy.on(
						'error',
						/** Surface a failed real backend as unavailable. */ () =>
							outgoing.writeHead(502).end(),
					)
					incoming.pipe(proxy)
					return
				}
				const candidate = resolve(root, '.' + decodeURIComponent(path))
				if (candidate !== root && !candidate.startsWith(root + sep)) {
					outgoing.writeHead(400).end()
					return
				}
				let file = candidate
				try {
					if (!(await stat(file)).isFile()) file = resolve(root, 'index.html')
				} catch {
					file = resolve(root, 'index.html')
				}
				const types: Record<string, string> = {
					'.html': 'text/html',
					'.js': 'text/javascript',
					'.json': 'application/json',
					'.css': 'text/css',
					'.woff2': 'font/woff2',
					'.svg': 'image/svg+xml',
				}
				outgoing.writeHead(200, {
					'content-type': types[extname(file)] ?? 'application/octet-stream',
				})
				outgoing.end(await readFile(file))
			}
		server = createServer(
			/** Catch asynchronous file failures at the HTTP boundary. */ (incoming, outgoing) => {
				void handleRequest(incoming, outgoing).catch(
					/** Return a test-server failure without an unhandled rejection. */ () =>
						outgoing.writeHead(500).end(),
				)
			},
		)
		await new Promise<void>(
			/** Reserve an isolated loopback HTTP port. */ (done) => server.listen(0, '127.0.0.1', done),
		)
		const address = server.address()
		if (!address || typeof address === 'string') throw new Error('Test listener unavailable')
		base = `http://acme.localhost:${address.port}`
		api = await startHcmTestApi(HcmAttendanceModule, base)
		browser = await chromium.launch({ headless: true })
	},
	60000,
)

afterAll(
	/** Close only resources owned by this disposable browser run. */ async () => {
		await browser?.close()
		await api?.close()
		if (server)
			await new Promise<void>(
				/** Drain the owned loopback server. */ (done) =>
					server.close(/** Complete after existing connections finish. */ () => done()),
			)
	},
)

/** Use a server-validated canonical persona and the real feature route. */
async function open(): Promise<Page> {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
	})
	const page = await context.newPage()
	page.on(
		'console',
		/** Report Angular errors caught by its global error handler. */ (entry) => {
			if (entry.type() === 'error') console.log('Angular browser error', entry.text())
		},
	)
	page.on(
		'pageerror',
		/** Surface runtime failures in the test report. */ (error) =>
			console.error('Browser error:', error.message),
	)
	page.on(
		'response',
		/** Report only failed endpoint paths and safe status codes. */ (response) => {
			if (response.status() >= 400)
				console.log('HTTP', response.status(), new URL(response.url()).pathname)
		},
	)
	await page.goto(base + '/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: /David Wallace/ }).click()
	await browserExpect(
		page.getByRole('button', { name: 'David Wallace', exact: true }),
	).toBeVisible()
	try {
		await page.getByRole('tab', { name: 'Administration', exact: true }).click()
		await page.getByRole('tab', { name: 'Reference Data and Policies', exact: true }).click()
		await page.getByRole('button', { name: /^Work Schedule Templates/ }).click()
		await browserExpect(
			page.getByRole('button', { name: 'Create template', exact: true }),
		).toBeVisible({ timeout: 20000 })
	} catch (error) {
		console.log('Browser state', page.url(), await page.locator('body').ariaSnapshot())
		await page.screenshot({ path: '.tmp/hcm-template-open-failure.png', fullPage: true })
		throw error
	}
	return page
}

/** Select an enum using the maintained control's keyboard and option interactions. */
async function select(page: Page, name: string, option: string): Promise<void> {
	await page.getByRole('combobox', { name, exact: true }).click()
	await page.getByRole('option', { name: option, exact: true }).click()
}

it('completes an explicit pattern, publishes, creates independent copies and preserves dirty editors', /** Real browser, real source decisions and real SQL receipts. */ async () => {
	const page = await open()
	try {
		await page.getByRole('button', { name: 'Create template', exact: true }).click()
		const editor = page.locator('ef-hcm-schedule-template-editor')
		await browserExpect(editor.getByRole('textbox', { name: 'Code', exact: true })).toHaveValue(
			'STANDARD_WEEK',
		)
		let posts = 0
		page.on(
			'request',
			/** Count only actual template create commands. */ (call) => {
				if (
					call.method() === 'POST' &&
					new URL(call.url()).pathname.endsWith('/schedule-templates')
				)
					posts++
			},
		)
		await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
		await browserExpect(
			editor.getByText('Complete the highlighted fields before saving.'),
		).toBeVisible()
		expect(posts).toBe(0)
		await editor.getByRole('textbox', { name: 'Code', exact: true }).fill('BROWSER_TEMPLATE')
		await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser exact pattern')
		await editor.getByRole('textbox', { name: 'Effective from', exact: true }).fill('Sep 28, 2026')
		await editor.getByRole('textbox', { name: 'Effective from', exact: true }).press('Tab')
		await select(page, 'Timezone policy', 'Employment timezone')
		const unpaid = editor.getByRole('textbox', { name: 'Proposed unpaid minutes', exact: true })
		await browserExpect(unpaid).toHaveCount(5)
		await unpaid.first().fill('0')
		await unpaid.first().press('Tab')
		await editor
			.getByRole('button', { name: 'Copy Monday pattern to other work days', exact: true })
			.click()
		await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
		await browserExpect(page.locator('ef-hcm-work-schedule-templates')).toBeVisible()
		const detail = page.locator('ef-hcm-object-page')
		await browserExpect(
			detail.getByRole('button', { name: 'Preview and publish', exact: true }),
		).toBeVisible()
		await detail.getByRole('button', { name: 'Edit draft', exact: true }).click()
		await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved name')
		await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
		await browserExpect(
			page.getByRole('dialog', { name: 'Discard changes?', exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
		await browserExpect(editor.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
			'Unsaved name',
		)
		await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
		await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
		await page.getByRole('row').filter({ hasText: 'BROWSER_TEMPLATE' }).click()
		await detail.getByRole('button', { name: 'Preview and publish', exact: true }).click()
		const dialog = page.locator('ef-hcm-template-action-dialog')
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Browser acceptance of explicit zero unpaid minutes')
		await dialog.getByRole('button', { name: 'Request preview', exact: true }).click()
		await browserExpect(dialog.getByText(/Reusable pattern review:/)).toBeVisible()
		const publishKeys: string[] = []
		await page.route(
			/\/schedule-templates\/[^/]+\/publish\?version=/,
			/** Drop the first committed reply, then forward the real idempotent recovery result. */ async (
				route,
			) => {
				publishKeys.push(route.request().headers()['idempotency-key'])
				const response = await route.fetch({
					url: route.request().url().replace('acme.localhost', '127.0.0.1'),
					headers: {
						...route.request().headers(),
						host: 'acme.localhost',
						'sec-fetch-site': 'same-origin',
					},
				})
				if (publishKeys.length === 1) await route.abort('failed')
				else await route.fulfill({ response })
			},
		)
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(dialog.getByText(/request could not be confirmed/i)).toBeVisible()
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(
			detail.getByRole('button', { name: 'Copy to schedule', exact: true }),
		).toBeVisible()
		expect(publishKeys).toHaveLength(2)
		expect(publishKeys[0]).toBe(publishKeys[1])
		await detail.getByRole('button', { name: 'Copy to schedule', exact: true }).click()
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(
			dialog.getByRole('textbox', { name: 'New schedule code', exact: true }),
		).toBeFocused()
		await dialog
			.getByRole('textbox', { name: 'New schedule code', exact: true })
			.fill('BROWSER_COPY')
		await dialog
			.getByRole('textbox', { name: 'New schedule name', exact: true })
			.fill('Independent browser copy')
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Independent copy acceptance')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(page.getByText(/Independent schedule draft created:/)).toBeVisible()
		const copies = await api.admin.query(
			'SELECT is_template AS "isTemplate" FROM hcm.work_schedule WHERE code=$1',
			['BROWSER_COPY'],
		)
		expect(copies.rows).toEqual([{ isTemplate: false }])
		await detail.getByRole('button', { name: 'Retire', exact: true }).click()
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Retire reusable source without changing its independent copy')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(
			detail.getByRole('button', { name: 'Copy to schedule', exact: true }),
		).toHaveCount(0)
		await browserExpect(
			detail.getByRole('button', { name: 'Create successor', exact: true }),
		).toBeVisible()
		await detail.getByRole('button', { name: 'Create successor', exact: true }).click()
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Create an independently editable successor')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(
			detail.getByRole('button', { name: 'Edit draft', exact: true }),
		).toBeVisible()
		await accessibility(page, 'ef-hcm-work-schedule-templates')
		await page.screenshot({ path: '.tmp/hcm-template-desktop.png', fullPage: true })
		await page.setViewportSize({ width: 390, height: 844 })
		await browserExpect(
			detail.getByRole('button', { name: 'Close detail', exact: true }),
		).toBeVisible()
		await page.screenshot({ path: '.tmp/hcm-template-narrow.png', fullPage: true })
		await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
		await browserExpect(
			page.getByRole('grid', { name: 'Schedule templates', exact: true }),
		).toBeVisible()
		await browserExpect(
			page.locator('ui5-table-row').filter({ hasText: 'BROWSER_TEMPLATE' }),
		).toBeFocused()
	} catch (error) {
		console.log('Failed browser state', page.url(), await page.locator('body').innerText())
		await page.screenshot({ path: '.tmp/hcm-template-browser-failure.png', fullPage: true })
		throw error
	} finally {
		await page.context().close()
	}
}, 120000)

it('preserves fractional local times and exposes honest empty, retry and denied states', /** Fresh real API data exercises editor precision and read-state recovery. */ async () => {
	const body: ScheduleDraft = {
		code: 'BROWSER_EXACT',
		name: 'Precise overnight pattern',
		isTemplate: true,
		effectiveFrom: '2026-09-28',
		timezoneMode: 'Fixed',
		fixedZone: 'America/New_York',
		weekStartsOn: 1,
		days: Array.from(
			{ length: 7 },
			/** Keep the test pattern explicit and separate from seed defaults. */ (_, index) => {
				if (index) return { weekday: index + 1, kind: 'Rest', segments: [] }
				return {
					weekday: 1,
					kind: 'Work',
					segments: [
						{ startTime: '23:00:01.125', endTime: '06:00:00.250', endDayOffset: 1, kind: 'Work' },
					],
				}
			},
		),
	}
	const created = await api.send<ScheduleVersionView>(
		'david',
		'POST',
		'attendance/schedule-templates',
		body,
	)
	expect(created.status).toBe(201)
	const before = await api.send<ScheduleVersionView>(
		'david',
		'GET',
		`attendance/schedule-templates/${created.body.id}?version=${created.body.versionId}`,
	)
	const page = await open()
	try {
		const code = page.getByRole('textbox', { name: 'Filter code', exact: true })
		await code.fill('DOES_NOT_EXIST')
		await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
		await browserExpect(page.getByText(/No templates match these filters/)).toBeVisible()
		await code.fill('BROWSER_EXACT')
		let fail = true
		await page.route(
			/\/api\/v1\/attendance\/schedule-templates\?/,
			/** Inject one transport failure without replacing business data. */ async (route) => {
				if (fail) {
					fail = false
					await route.abort('failed')
				} else await route.continue()
			},
		)
		await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
		await browserExpect(
			page.getByText('Content could not be loaded', { exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Retry', exact: true }).click()
		const row = page.getByRole('row').filter({ hasText: 'BROWSER_EXACT' })
		await browserExpect(row).toBeVisible()
		const navigation = row.getByRole('button', { name: 'Navigation', exact: true })
		await navigation.focus()
		await navigation.press('Enter')
		const detail = page.locator('ef-hcm-object-page')
		await browserExpect(
			detail.getByRole('button', { name: 'Edit draft', exact: true }),
		).toBeVisible()
		await detail.getByRole('button', { name: 'Maximize detail', exact: true }).click()
		await detail.getByRole('button', { name: 'Minimize detail', exact: true }).click()
		await detail.getByRole('button', { name: 'Edit draft', exact: true }).click()
		const editor = page.locator('ef-hcm-schedule-template-editor')
		const start = editor.getByRole('textbox', { name: 'Start time', exact: true })
		await browserExpect(start).toHaveValue('23:00:01.125')
		await start.focus()
		await start.press('Tab')
		await editor
			.getByRole('textbox', { name: 'Name', exact: true })
			.fill('Precise overnight edited')
		await accessibility(page, 'ef-hcm-schedule-template-editor')
		await page.screenshot({ path: '.tmp/hcm-template-editor.png', fullPage: true })
		await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
		await browserExpect(
			detail.getByText('Precise overnight edited', { exact: true }).first(),
		).toBeVisible()
		const saved = await api.send<ScheduleVersionView>(
			'david',
			'GET',
			`attendance/schedule-templates/${created.body.id}?version=${created.body.versionId}`,
		)
		expect(saved.body.days).toEqual(before.body.days)
		expect(saved.body.minimumRestMinutes).toBeUndefined()
		let release!: () => void
		let received!: () => void
		const captured = new Promise<void>(
			/** Observe a real response before holding delivery. */ (resolve) => {
				received = resolve
			},
		)
		const delivery = new Promise<void>(
			/** Release the old-context response only after context change. */ (resolve) => {
				release = resolve
			},
		)
		let delivered!: () => void
		const completed = new Promise<void>(
			/** Wait until the held response has been delivered or cancelled. */ (resolve) => {
				delivered = resolve
			},
		)
		await page.route(
			/\/api\/v1\/attendance\/schedule-templates\?/,
			/** Delay real old-context data without replacing its content. */ async (route) => {
				const response = await route.fetch({
					url: route.request().url().replace('acme.localhost', '127.0.0.1'),
					headers: { ...route.request().headers(), host: 'acme.localhost' },
				})
				received()
				await delivery
				await route.fulfill({ response })
				delivered()
			},
			{ times: 1 },
		)
		await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
		await captured
		await page.getByRole('button', { name: 'David Wallace', exact: true }).click()
		await page.getByRole('menuitem', { name: /^Settings/ }).click()
		await page.getByRole('combobox', { name: 'Development persona' }).click()
		await page.getByRole('option', { name: /Jim Halpert/ }).click()
		await browserExpect(
			page.getByRole('button', { name: 'Jim Halpert', exact: true }),
		).toBeVisible()
		release()
		await completed
		await browserExpect(page.getByText('Precise overnight edited', { exact: true })).toHaveCount(0)
		await browserExpect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(
			0,
		)
		await page.goto(base + '/attendance/work-schedule-templates')
		await browserExpect(
			page.getByRole('heading', { name: 'Access denied', exact: true }),
		).toBeVisible()
	} finally {
		await page.context().close()
	}
}, 120000)
