import { RUNTIME_CONFIG } from '@empflowyee/platform-web-runtime-shell'
import type { HcmBrowserRuntimeConfig } from '@empflowyee/hcm-web-runtime-context'
import { Component, inject } from '@angular/core'
import { HcmShellComponent } from '@empflowyee/hcm-web-shell'

@Component({
	imports: [HcmShellComponent],
	selector: 'ef-hcm-root',
	templateUrl: './app.html',
	styleUrl: './app.scss',
})
export class App {
	readonly products =
		(inject(RUNTIME_CONFIG, { optional: true }) as HcmBrowserRuntimeConfig | null)?.productLinks ??
		[]
}
