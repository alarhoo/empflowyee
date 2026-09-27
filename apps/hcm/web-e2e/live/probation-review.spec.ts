import { openApplicationSearch } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

test.use({ actionTimeout: 20000 })

const API = 'http://127.0.0.1:4402/api/v1/employee'
/** Shared findings recorded outside this app: Display Form definition lists and ObjectStatus contrast. */
const SHARED_FINDINGS = ['color-contrast', 'definition-list', 'dlitem', 'only-dlitems']

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

/** Headers of a real local request as a persona. */
function headers(persona: string) {
	return {
		host: 'acme.localhost',
		'x-hcm-development-persona': persona,
		origin: 'http://acme.localhost:4302',
		'sec-fetch-site': 'same-origin',
		'Idempotency-Key': randomUUID(),
	}
}

/** An ISO date some days from today. */
function daysAhead(days: number): string {
	const date = new Date()
	date.setDate(date.getDate() + days)
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** As Toby, hire a worker in probation and assign Michael to the Final review. */
async function arrange(page: Page, stamp: string): Promise<void> {
	const hired = await page.request.post(`${API}/records`, {
		headers: headers('toby'),
		data: {
			person: { givenName: 'Erin', familyName: `Hannon${stamp}` },
			worker: { workerNumber: `DM-E${stamp}`, workerTypeId: 'dunder-mifflin/worker-type/employee' },
			employment: {
				legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
				employmentType: 'Permanent',
				hireDate: daysAhead(-30),
				workEmail: `erin.${stamp.toLowerCase()}@dundermifflin.example`,
				probationEndDate: daysAhead(60),
			},
			assignment: {
				unitId: 'dunder-mifflin/organisation/scranton',
				departmentId: 'dunder-mifflin/department/reception',
				designationId: 'dunder-mifflin/designation/receptionist',
				locationId: 'dunder-mifflin/location/scranton',
				jobTitle: 'Receptionist',
				workMode: 'OnSite',
				fullTimeEquivalent: 1,
				standardHoursPerWeek: 40,
			},
			managerWorkerId: 'dunder-mifflin/worker/michael',
			duplicateResolution: { kind: 'none' },
			reason: 'Browser probation review acceptance',
		},
	})
	expect(hired.status(), await hired.text()).toBe(201)
	const cases = await page.request.get(`${API}/probation/cases?q=${stamp}`, {
		headers: headers('toby'),
	})
	const reviewId = (await cases.json()).items[0].nextReview.id as string
	const review = await page.request.get(
		`${API}/probation/reviews/${encodeURIComponent(reviewId)}`,
		{
			headers: headers('toby'),
		},
	)
	const assigned = await page.request.post(
		`${API}/probation/reviews/${encodeURIComponent(reviewId)}/reviewer`,
		{
			headers: headers('toby'),
			data: {
				reviewerAccountId: 'dunder-mifflin/account/michael',
				expectedRevision: (await review.json()).revision,
				reason: 'Michael manages the front desk',
			},
		},
	)
	expect(assigned.status(), await assigned.text()).toBe(200)
}

/** Switch to Michael through the real Settings dialog and open Probation Review from catalogue search. */
async function open(page: Page): Promise<void> {
	page.on(
		'pageerror',
		/** Surface component runtime errors during browser acceptance. */ (error) =>
			console.log('BROWSER ERROR', error.message),
	)
	await page.goto('/')
	await page.getByRole('button', { name: 'Jim Halpert', exact: true }).click()
	await page.getByRole('menuitem', { name: /^Settings/ }).click()
	await page.getByRole('combobox', { name: 'Development persona' }).click()
	await page.getByRole('option', { name: 'Michael Scott', exact: false }).click()
	await expect(page.getByRole('button', { name: 'Michael Scott', exact: true })).toBeVisible()
	await openApplicationSearch(page)
	await page.getByRole('textbox', { name: 'Search applications' }).fill('PROBATION_REVIEW')
	await page
		.getByRole('button', { name: /^Probation Review/ })
		.first()
		.click()
	await expect(page).toHaveURL(/\/employee\/probation-review$/)
	await expect(page.getByRole('grid', { name: 'Assigned reviews' })).toBeVisible()
}

/** Choose an option of a native Select by its visible text. */
async function choose(page: Page, scope: string, label: string, option: string): Promise<void> {
	await page.locator(scope).getByRole('combobox', { name: label, exact: true }).click()
	await page.getByRole('option', { name: option, exact: true }).click()
}

/** Set the rating with the keyboard: End selects 5, each ArrowLeft one less. */
async function rate(page: Page, stars: number): Promise<void> {
	const rating = page
		.locator('ef-hcm-assessment-page')
		.getByRole('slider', { name: 'Overall rating from 1 to 5' })
	await rating.focus()
	await rating.press('End')
	for (let step = stars; step < 5; step++) await rating.press('ArrowLeft')
}

test('assesses an assigned review and supersedes the assessment before HR decides', /** REQ-PROBATION-REVIEW-001 to -003, -005. */ async ({
	page,
}) => {
	const stamp = Date.now().toString(36).toUpperCase().slice(-5)
	await arrange(page, stamp)
	await open(page)
	const rows = page.locator('ui5-table[accessible-name="Assigned reviews"] ui5-table-row[row-key]')
	const mine = rows.filter({ hasText: `Erin Hannon${stamp}` })
	await expect(mine).toHaveCount(1)
	await expect(mine).toContainText('Awaiting assessment')
	expect(await violations(page, 'ef-hcm-probation-review')).toEqual([])
	await mine.click()
	const review = page.locator('ef-hcm-reviewer-review')
	await expect(review).toContainText('Receptionist')
	await expect(review).not.toContainText('@dundermifflin.example')
	await review.getByRole('button', { name: 'Assess', exact: true }).click()
	await expect(page).toHaveURL(/\/assessment$/)

	const form = 'ef-hcm-assessment-page'
	// A missing rating and reason keep the draft on the page.
	await choose(page, form, 'Recommendation', 'Confirm')
	await page.getByRole('button', { name: 'Submit assessment' }).click()
	await expect(page.getByText('Choose a rating from 1 to 5.')).toBeVisible()
	await rate(page, 4)
	await page
		.locator(form)
		.getByRole('textbox', { name: 'Strengths' })
		.fill('Warm with every visitor')
	await page
		.locator(form)
		.getByRole('textbox', { name: 'Recommendation reason' })
		.fill('Ready for the role')
	expect(await violations(page, form)).toEqual([])
	await page.getByRole('button', { name: 'Submit assessment' }).click()
	await expect(page).toHaveURL(/\/employee\/probation-review\/[^/]+$/)
	await expect(review).toContainText('Ready for the role')
	await expect(mine).toContainText('Assessment submitted')

	// Resubmitting supersedes the first assessment; leaving a dirty draft asks first.
	await review.getByRole('button', { name: 'Update assessment', exact: true }).click()
	await choose(page, form, 'Recommendation', 'Extend')
	await page.getByRole('button', { name: 'Cancel', exact: true }).click()
	await expect(page.locator('ef-hcm-discard-dialog ui5-dialog[open]')).toBeVisible()
	await page.locator('ef-hcm-discard-dialog').getByRole('button', { name: 'Keep editing' }).click()
	await rate(page, 3)
	await page
		.locator(form)
		.getByRole('textbox', { name: 'Recommendation reason' })
		.fill('Needs another month on scheduling')
	await page.getByRole('button', { name: 'Submit assessment' }).click()
	await expect(review).toContainText('Needs another month on scheduling')
	await expect(review.getByText('1 (superseded)')).toBeAttached()
})

test('keeps probation review away from personas without the reviewer grant', /** REQ-PROBATION-REVIEW-001. */ async ({
	page,
}) => {
	await page.goto('/employee/probation-review')
	await expect(page.getByRole('grid', { name: 'Assigned reviews' })).toHaveCount(0)
})
