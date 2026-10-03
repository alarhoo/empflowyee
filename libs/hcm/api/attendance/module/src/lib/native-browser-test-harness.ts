import type { Page } from '@playwright/test'

/** Wait for form-adapter animation-frame setup and active finite visual transitions before interaction or accessibility measurement. */
export async function settleNativeBrowserControls(page: Page): Promise<void> {
	await page.evaluate(
		/** Match a painted, initialized native screen without changing inputs, authorization or network responses. */ async () => {
			await document.fonts.ready
			await new Promise<void>(
				/** Allow the installed native CVA's deferred listener initialization and its resulting render. */ (
					resolve,
				) =>
					requestAnimationFrame(
						/** Complete a second painted frame after native setup. */ () =>
							requestAnimationFrame(/** Resume once native setup has rendered. */ () => resolve()),
					),
			)
			await Promise.all(
				document
					.getAnimations()
					.filter(
						/** Ignore paused effects and looping indicators; only running finite transitions settle. */ (
							animation,
						) =>
							animation.playState === 'running' &&
							Number.isFinite(animation.effect?.getComputedTiming().endTime),
					)
					.map(
						/** Cancelled transitions are already settled and do not alter business assertions. */ (
							animation,
						) =>
							animation.finished.catch(
								/** A replaced animation no longer needs waiting. */ () => undefined,
							),
					),
			)
		},
	)
}
