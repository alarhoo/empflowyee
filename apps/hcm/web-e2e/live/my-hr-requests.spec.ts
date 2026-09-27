import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

test.use({ actionTimeout: 20000 })

/** Shared findings recorded outside this app: Display Form definition lists and ObjectStatus contrast. */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']
const API = 'http://127.0.0.1:4402/api/v1/employee'

/** The native FCL separator arrows have no public label API and sit inside the separators. */
function nativeFclFinding(target: unknown): boolean {
	const path = JSON.stringify(target)
	return (
		path.startsWith('[["ui5-flexible-column-layout",".ui5-fcl-arrow"') ||
		/^\[\["ui5-flexible-column-layout","\.ui5-fcl-separator-(start|end)"\]\]$/.test(path)
	)
}

/** Run axe on a feature host and return violations other than the recorded shared findings. */
async function violations(page: Page, host: string): Promise<string[]> {
	const result = await new AxeBuilder({ page }).include(host).analyze()
	return result.violations
		.filter(/** Keep app-attributable findings. */ (item) => !SHARED_FINDINGS.includes(item.id))
		.flatMap(
			/** Report each remaining node by rule and target. */ (item) =>
				item.nodes
					.filter(/** Drop native FCL internals only. */ (node) => !nativeFclFinding(node.target))
					.map(/** Identify the finding. */ (node) => `${item.id} ${JSON.stringify(node.target)}`),
		)
}

/** Browser-like write headers for a persona. */
function headers(persona: string) {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': persona,
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}

/** Raise a general question as Jim through the real API and return its id. */
async function raise(page: Page, subject: string): Promise<string> {
	const response = await page.request.post(`${API}/me/hr-requests`, {
		headers: headers('jim'),
		multipart: {
			metadata: JSON.stringify({
				typeId: 'dunder-mifflin/hr-request-type/general-question',
				subject,
				description: 'Who approves parking changes?',
			}),
		},
	})
	expect(response.status(), await response.text()).toBe(201)
	return (await response.json()).id
}

/** Move a request as Toby on the desk through the real API. */
async function deskMove(page: Page, id: string, status: string, extra: Record<string, unknown>) {
	const path = `${API}/hr-service/requests/${encodeURIComponent(id)}`
	const current = await (await page.request.get(path, { headers: headers('toby') })).json()
	const response = await page.request.post(`${path}/status`, {
		headers: headers('toby'),
		data: { status, expectedRevision: current.revision, ...extra },
	})
	expect(response.status(), await response.text()).toBe(200)
}

/** Report runtime errors and open an app as Jim from catalogue search. */
async function openApp(page: Page, code: string, title: RegExp): Promise<void> {
	page.on(
		'pageerror',
		/** Surface component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Jim Halpert', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill(code)
	await page.getByRole('button', { name: title }).first().click()
}

/** Run an Object Page action, opening the toolbar overflow when the column is narrow. */
async function act(page: Page, name: string): Promise<void> {
	const scope = page.locator('ef-hcm-my-hr-request-page')
	const button = scope.getByRole('button', { name, exact: true })
	await expect(
		/** Wait until the action is shown or folded into the overflow. */ async () =>
			expect(
				(await button.isVisible()) ||
					(await scope.getByRole('button', { name: 'Additional Options' }).isVisible()),
			).toBe(true),
	).toPass({ timeout: 15000 })
	if (!(await button.isVisible())) {
		await scope.getByRole('button', { name: 'Additional Options' }).click()
		await page.locator('ui5-toolbar-button, ui5-button').filter({ hasText: name }).last().click()
		return
	}
	await button.click()
}

/** Open one own request by its subject. */
async function openRequest(page: Page, subject: string): Promise<void> {
	await page
		.locator('ui5-table[accessible-name="My HR requests"] ui5-table-row[row-key]')
		.filter({ hasText: subject })
		.click()
	await expect(page.locator('ef-hcm-my-hr-request-page')).toContainText(subject)
}

test('requests a correction from My Profile and cancels it', /** REQ-MY-HR-REQUESTS-001, -003, -004. */ async ({
	page,
}) => {
	await openApp(page, 'MY_PROFILE', /^My Profile/)
	const profile = page.locator('ef-hcm-my-profile')
	await profile.getByRole('tab', { name: 'Personal', exact: true }).click()
	await profile.getByRole('link', { name: 'Request correction of Legal first name' }).click()
	await expect(page).toHaveURL(/\/employee\/my-hr-requests\?new=personal-data-correction&field=/)
	const dialog = page.locator('ef-hcm-my-hr-request-dialog')
	const type = dialog.getByRole('combobox', { name: 'Request type', exact: true })
	await expect(type).toContainText('Personal data correction')
	const subject = dialog.getByRole('textbox', { name: 'Subject' })
	await expect(subject).toHaveValue(/^Correct my legal given name$/)
	const stamp = Date.now().toString(36).toUpperCase().slice(-5)
	await subject.fill(`Correct my legal first name ${stamp}`)
	await dialog.getByRole('textbox', { name: 'Description' }).fill('My legal first name is James.')
	expect(await violations(page, 'ef-hcm-my-hr-request-dialog')).toEqual([])
	await dialog.getByRole('button', { name: 'Submit', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(/Request HR-\d{6} was submitted\./)).toBeVisible()
	const request = page.locator('ef-hcm-my-hr-request-page')
	await expect(request).toContainText('My legal first name is James.')
	await expect(request).toContainText('Submitted')
	expect(await violations(page, 'ef-hcm-my-hr-requests')).toEqual([])

	await act(page, 'Cancel request')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('HR fixed it on the phone.')
	await dialog.getByRole('button', { name: 'Cancel request', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(/HR-\d{6} was cancelled\./)).toBeVisible()
	await expect(request).toContainText('it no longer takes replies')
})

test('replies when HR waits and reopens a resolved request', /** REQ-MY-HR-REQUESTS-002, -003. */ async ({
	page,
}) => {
	const stamp = Date.now().toString(36).toUpperCase().slice(-5)
	const waiting = `Parking ${stamp}`
	const resolved = `Party ${stamp}`
	const first = await raise(page, waiting)
	await deskMove(page, first, 'WaitingForEmployee', { reason: 'Which floor do you park on?' })
	const second = await raise(page, resolved)
	await deskMove(page, second, 'Resolved', {
		resolutionCode: 'Answered',
		resolutionSummary: 'The party is on Friday.',
	})
	await openApp(page, 'MY_HR_REQUESTS', /^My HR Requests/)
	await expect(page).toHaveURL(/\/employee\/my-hr-requests$/)
	await openRequest(page, waiting)
	const request = page.locator('ef-hcm-my-hr-request-page')
	await expect(request).toContainText('Which floor do you park on?')
	await expect(request).toContainText('Waiting for you')
	await request.getByRole('textbox', { name: 'Reply' }).fill('The second floor.')
	await request.getByRole('button', { name: 'Send reply' }).click()
	await expect(page.getByText('Your reply was sent to HR.')).toBeVisible()
	await expect(request).toContainText('With HR')
	expect(await violations(page, 'ef-hcm-my-hr-request-page')).toEqual([])

	await openRequest(page, resolved)
	await expect(request).toContainText('The party is on Friday.')
	await expect(request).toContainText('You can reopen until')
	await act(page, 'Reopen')
	const dialog = page.locator('ef-hcm-my-hr-request-dialog')
	await dialog.getByRole('textbox', { name: 'Reason' }).fill('Which Friday?')
	await dialog.getByRole('button', { name: 'Reopen', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.getByText(/HR-\d{6} was reopened\./)).toBeVisible()
	await expect(request).toContainText('In progress')
})
