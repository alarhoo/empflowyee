import { Component } from '@angular/core'
import { HcmShellComponent } from '@empflowyee/hcm-web-shell'

@Component({
	imports: [HcmShellComponent],
	selector: 'ef-hcm-root',
	templateUrl: './app.html',
	styleUrl: './app.scss',
})
export class App {}
