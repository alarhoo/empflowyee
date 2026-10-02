import { HcmAttendanceModule } from './hcm-api-attendance-module'
import { HcmNotificationsModule } from '@empflowyee/hcm-api-notifications-module'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test'
import { createServer, request, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { Module } from '@nestjs/common'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import type { WorkloadAuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { HcmWorkloadIssuer, type HcmWorkloadContext } from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	HcmDurableWorkStore,
	HcmTransactionalWorkerLane,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { KyselyHolidayPreviewHandler } from '@empflowyee/hcm-api-attendance-infrastructure'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import { randomUUID } from 'node:crypto'

@Module({ imports: [HcmAttendanceModule, HcmNotificationsModule] })
class HolidayBrowserModule {}
let database: HcmTenantDatabase<WorkloadAuditTables>,
	directory: HcmRuntimeStore,
	workerContext: HcmWorkloadContext,
	lane: HcmTransactionalWorkerLane<WorkloadAuditTables>

import { startHcmTestApi, type HcmTestApi } from './attendance-test-harness'

let api: HcmTestApi
let server: Server
let browser: Browser
let base: string
const root = resolve(process.env['HCM_HOLIDAY_BROWSER_ROOT'] ?? 'dist/apps/hcm/web/browser')

/** Isolate recorded native Form/FCL and inverted-status findings from feature accessibility regressions. */
async function accessibility(page: Page, selector: string): Promise<void> {
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
							(target.startsWith('[["ui5-form[') || target.startsWith('[["ui5-form-item['))
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
		api = await startHcmTestApi(HolidayBrowserModule, base)
		browser = await chromium.launch({ headless: true })
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		database = new HcmTenantDatabase({ connectionString })
		directory = new HcmRuntimeStore(connectionString)
		workerContext = await new HcmWorkloadIssuer(directory, ['AttendanceResolve']).issue(
			'local-dunder-mifflin',
			'AttendanceResolve',
			randomUUID(),
			600000,
		)
		lane = new HcmTransactionalWorkerLane(
			'AttendanceResolve',
			new HcmDurableWorkStore(database, { leaseMilliseconds: 60000, maximumAttempts: 3 }),
			[new KyselyHolidayPreviewHandler(new KyselyWorkforceTimeContextBinder())],
		)
	},
	60000,
)

afterAll(
	/** Close only resources owned by this disposable browser run. */ async () => {
		await browser?.close()
		await database?.destroy()
		await directory?.onApplicationShutdown()
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
	// The development picker is intentionally memory-only. Keep this test browser's
	// explicit persona header across reloads through the same real local session boundary.
	await context.setExtraHTTPHeaders({ 'x-hcm-development-persona': 'david' })
	try {
		await page.getByRole('tab', { name: 'Administration', exact: true }).click()
		await page.getByRole('tab', { name: 'Reference Data and Policies', exact: true }).click()
		const tile = page.getByRole('button', { name: /^Holiday Calendars/ })
		await browserExpect(tile).toContainText('Available')
		await tile.click()
		await browserExpect(
			page.getByRole('button', { name: 'Create calendar', exact: true }),
		).toBeVisible({ timeout: 20000 })
	} catch (error) {
		console.log('Browser state', page.url(), await page.locator('body').ariaSnapshot())
		await page.screenshot({ path: '.tmp/hcm-holiday-open-failure.png', fullPage: true })
		throw error
	}
	return page
}

/** Select an enum using the maintained control's keyboard and option interactions. */
async function select(page: Page, name: string, option: string): Promise<void> {
	await page.getByRole('combobox', { name, exact: true }).click()
	await page.getByRole('option', { name: option, exact: true }).click()
}

it('creates an explicit holiday, obtains durable publication evidence and preserves lifecycle state on reload', /** Exercise native controls with actual HTTP, SQL, authorization and worker completion. */ async () => {
	const page = await open()
	try {
		await page.getByRole('button', { name: 'Create calendar', exact: true }).click()
		const editor = page.locator('ef-hcm-holiday-calendar-editor')
		let creates = 0
		page.on(
			'request',
			/** Count actual create requests to verify invalid forms stay local. */ (call) => {
				if (call.method() === 'POST' && new URL(call.url()).pathname.endsWith('/holiday-calendars'))
					creates++
			},
		)
		await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
		await browserExpect(
			editor.getByText('Complete the highlighted calendar fields before saving.'),
		).toBeVisible()
		expect(creates).toBe(0)
		await editor.getByRole('textbox', { name: 'Code', exact: true }).fill('BROWSER_HOLIDAY')
		await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser holiday')
		for (const name of ['Effective from', 'Effective to']) {
			await editor
				.getByRole('textbox', { name, exact: true })
				.fill(name === 'Effective to' ? 'Oct 9, 2026' : 'Oct 5, 2026')
			await editor.getByRole('textbox', { name, exact: true }).press('Tab')
		}
		await editor.getByRole('button', { name: 'Add holiday', exact: true }).click()
		await editor
			.getByRole('textbox', { name: 'Holiday name', exact: true })
			.fill('Explicit company day')
		for (const name of ['Actual date', 'Observed date']) {
			await editor.getByRole('textbox', { name, exact: true }).pressSequentially('Oct 5, 2026')
			await editor.getByRole('textbox', { name, exact: true }).press('Tab')
			await browserExpect(editor.getByRole('textbox', { name, exact: true })).toHaveValue(
				'Oct 5, 2026',
			)
		}
		await select(page, 'Category', 'Company')
		await editor.getByRole('textbox', { name: 'Priority', exact: true }).fill('2')
		await editor.getByRole('textbox', { name: 'Priority', exact: true }).press('Tab')
		await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
		const detail = page.locator('ef-hcm-object-page')
		await browserExpect(
			detail.getByRole('button', { name: 'Preview and publish', exact: true }),
		).toBeVisible()
		await page.reload()
		await detail.getByRole('button', { name: 'Preview and publish', exact: true }).click()
		const dialog = page.locator('ef-hcm-calendar-action-dialog')
		await dialog.getByRole('button', { name: 'Request preview', exact: true }).click()
		await browserExpect(dialog.getByText('Select the employment to validate.')).toBeVisible()
		await dialog.getByRole('textbox', { name: 'Find worker', exact: true }).fill('Jim')
		await dialog.getByRole('button', { name: 'Search workers', exact: true }).click()
		await dialog.getByRole('combobox', { name: 'Worker', exact: true }).click()
		await page.getByRole('option', { name: /Jim Halpert/ }).click()
		await dialog.getByRole('combobox', { name: 'Employment', exact: true }).click()
		await page.getByRole('option', { name: /employment\/jim/ }).click()
		await dialog
			.getByRole('combobox', { name: 'Validation timezone', exact: true })
			.fill('America/New_York')
		await dialog.getByRole('combobox', { name: 'Validation timezone', exact: true }).press('Tab')
		await dialog.getByRole('button', { name: 'Request preview', exact: true }).click()
		await browserExpect(dialog.getByText(/Review: Running/)).toBeVisible()
		await browserExpect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
		const work = await lane.claim(workerContext)
		if (!work) throw new Error('Publication preview was not enqueued')
		await lane.complete(workerContext, work)
		await dialog.getByRole('button', { name: 'Refresh preview', exact: true }).click()
		await browserExpect(dialog.getByText(/Review: Ready/)).toBeVisible()
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Browser reviewed explicit context')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(detail.getByRole('button', { name: 'Retire', exact: true })).toBeVisible()
		await page.reload()
		await browserExpect(detail.getByRole('button', { name: 'Retire', exact: true })).toBeVisible()
		const assignment = page.locator('ef-hcm-holiday-assignments')
		/** Select Jim through real calendar-owned reference endpoints after every reload or effective-date change. */
		async function chooseAssignmentEmployment() {
			await detail.getByRole('tab', { name: 'Assignments', exact: true }).click()
			await assignment
				.getByRole('textbox', { name: 'Find assignment target', exact: true })
				.fill('Jim')
			await assignment
				.getByRole('button', { name: 'Search assignment targets', exact: true })
				.click()
			await assignment.getByRole('combobox', { name: 'Assignment target', exact: true }).click()
			await page.getByRole('option', { name: /Jim Halpert/ }).click()
			await assignment.getByRole('combobox', { name: 'Assignment employment', exact: true }).click()
			await page.getByRole('option', { name: /employment\/jim/ }).click()
		}
		await chooseAssignmentEmployment()
		await assignment.getByRole('button', { name: 'Assign calendar', exact: true }).click()
		await browserExpect(assignment.getByText('Correct the assignment fields.')).toBeVisible()
		await assignment
			.getByRole('textbox', { name: 'Assignment reason', exact: true })
			.fill('Assign reviewed calendar')
		const assignmentKeys: string[] = []
		await page.route(
			/\/api\/v1\/attendance\/holiday-calendar-assignments$/,
			/** Lose one real committed reply to exercise uncertain-result recovery in the UI. */ async (
				route,
			) => {
				if (route.request().method() !== 'POST') {
					await route.continue()
					return
				}
				assignmentKeys.push(route.request().headers()['idempotency-key'])
				const response = await route.fetch({
					url: route.request().url().replace('acme.localhost', '127.0.0.1'),
					headers: {
						...route.request().headers(),
						host: 'acme.localhost',
						'sec-fetch-site': 'same-origin',
					},
				})
				if (assignmentKeys.length === 1) await route.abort('failed')
				else await route.fulfill({ response })
			},
		)
		await assignment.getByRole('button', { name: 'Assign calendar', exact: true }).click()
		await browserExpect(assignment.getByText(/request could not be confirmed/i)).toBeVisible()
		await assignment.getByRole('button', { name: 'Assign calendar', exact: true }).click()
		await browserExpect(
			assignment.getByText(/Assignment saved. 0 workdays queued; 1 unavailable/),
		).toBeVisible()
		expect(assignmentKeys).toHaveLength(2)
		expect(assignmentKeys[0]).toBe(assignmentKeys[1])
		await page.unroute(/\/api\/v1\/attendance\/holiday-calendar-assignments$/)
		await page.reload()
		await chooseAssignmentEmployment()
		await assignment.getByRole('button', { name: 'Check current assignment', exact: true }).click()
		await browserExpect(assignment.getByText(/Assigned calendar: Browser holiday/)).toBeVisible()
		for (const name of ['Assignment from', 'Resolve workdays from', 'Resolve workdays through']) {
			await assignment.getByRole('textbox', { name, exact: true }).fill('Oct 7, 2026')
			await assignment.getByRole('textbox', { name, exact: true }).press('Tab')
		}
		await chooseAssignmentEmployment()
		await assignment.getByRole('button', { name: 'Check current assignment', exact: true }).click()
		const supersede = assignment.getByRole('checkbox', {
			name: 'Supersede this assignment from the selected start date',
			exact: true,
		})
		await supersede.focus()
		await supersede.press('Space')
		await browserExpect(supersede).toBeChecked()
		await assignment
			.getByRole('textbox', { name: 'Assignment reason', exact: true })
			.fill('Supersede explicit dated coverage')
		await assignment.getByRole('button', { name: 'Assign calendar', exact: true }).click()
		await browserExpect(
			assignment.getByText(/Assignment saved. 0 workdays queued; 1 unavailable/),
		).toBeVisible()
		await assignment
			.getByRole('textbox', { name: 'Assignment reason', exact: true })
			.fill('Unsaved future action')
		await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
		await browserExpect(
			page.getByRole('dialog', { name: 'Discard changes?', exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
		await browserExpect(
			assignment.getByRole('textbox', { name: 'Assignment reason', exact: true }),
		).toHaveValue('Unsaved future action')
		await assignment.getByRole('textbox', { name: 'Assignment reason', exact: true }).fill('')
		expect(
			(
				await api.admin.query(
					'SELECT effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",revision FROM hcm.holiday_calendar_assignment ORDER BY effective_from',
				)
			).rows,
		).toEqual([
			{ effectiveFrom: '2026-10-05', effectiveTo: '2026-10-06', revision: 2 },
			{ effectiveFrom: '2026-10-07', effectiveTo: '2026-10-09', revision: 1 },
		])
		await page.reload()
		await page.setViewportSize({ width: 390, height: 844 })
		await detail.getByRole('tab', { name: 'Assignments', exact: true }).click()
		await browserExpect(
			detail.getByRole('button', { name: 'Close detail', exact: true }),
		).toBeVisible()
		await accessibility(page, 'ef-hcm-holiday-calendars')
		await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
		const row = page.getByRole('row').filter({ hasText: 'BROWSER_HOLIDAY' })
		await row.focus()
		await page.keyboard.press('Enter')
		await browserExpect(
			detail.getByRole('button', { name: 'Close detail', exact: true }),
		).toBeVisible()
		await page.setViewportSize({ width: 1440, height: 1000 })
		await detail.getByRole('button', { name: 'Retire', exact: true }).click()
		await dialog
			.getByRole('textbox', { name: 'Reason', exact: true })
			.fill('Retire the browser calendar')
		await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
		await browserExpect(detail.getByRole('button', { name: 'Retire', exact: true })).toHaveCount(0)
		expect(
			(
				await api.admin.query(
					"SELECT v.state FROM hcm.holiday_calendar c JOIN hcm.holiday_calendar_version v ON v.tenant_id=c.tenant_id AND v.calendar_id=c.id WHERE c.code='BROWSER_HOLIDAY'",
				)
			).rows,
		).toEqual([{ state: 'Retired' }])
		expect(creates).toBe(1)
	} catch (error) {
		console.log('Holiday browser state', page.url(), await page.locator('body').ariaSnapshot())
		await page.screenshot({ path: '.tmp/holiday-journey-failure.png', fullPage: true })
		throw error
	} finally {
		await page.context().close()
	}
})

it('recovers failed reads and clears delayed data after authority changes', /** Exercise truthful list states and actual persona authorization. */ async () => {
	const page = await open()
	try {
		const code = page.getByRole('textbox', { name: 'Filter code', exact: true })
		await code.fill('DOES_NOT_EXIST')
		await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
		await browserExpect(page.getByText(/No calendars match these filters/)).toBeVisible()
		await code.fill('BROWSER_HOLIDAY')
		await page.route(
			/\/api\/v1\/attendance\/holiday-calendars\?/,
			/** Fail transport once without manufacturing a business response. */ (route) =>
				route.abort('failed'),
			{ times: 1 },
		)
		await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
		await browserExpect(
			page.getByText('Content could not be loaded', { exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Retry', exact: true }).click()
		await browserExpect(page.getByRole('row').filter({ hasText: 'BROWSER_HOLIDAY' })).toBeVisible()
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
			/\/api\/v1\/attendance\/holiday-calendars\?/,
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
		await page.context().setExtraHTTPHeaders({})
		await page.getByRole('button', { name: 'David Wallace', exact: true }).click()
		await page.getByRole('menuitem', { name: /^Settings/ }).click()
		await page.getByRole('combobox', { name: 'Development persona' }).click()
		await page.getByRole('option', { name: /Jim Halpert/ }).click()
		await browserExpect(
			page.getByRole('button', { name: 'Jim Halpert', exact: true }),
		).toBeVisible()
		release()
		await completed
		await browserExpect(page.getByText('Browser holiday', { exact: true })).toHaveCount(0)
		await browserExpect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(
			0,
		)
		await page.goto(base + '/attendance/holiday-calendars')
		await browserExpect(
			page.getByRole('heading', { name: 'Access denied', exact: true }),
		).toBeVisible()
	} finally {
		await page.context().close()
	}
}, 120000)
