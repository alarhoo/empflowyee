import { test, expect } from '@playwright/test'

test('has title', /** Open the account home page and verify that its welcome heading is visible in the page content. */ async ({
	page,
}) => {
	await page.goto('/')

	// Expect h1 to contain a substring.
	expect(await page.locator('h1').innerText()).toContain('Welcome')
})
