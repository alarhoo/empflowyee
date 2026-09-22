import { Component } from '@angular/core'
import { RouterModule } from '@angular/router'

@Component({
	host: { class: 'hcm-app-canvas' },
	imports: [RouterModule],
	selector: 'ef-hcm-root',
	templateUrl: './app.html',
	styleUrl: './app.scss',
})
export class App {}
