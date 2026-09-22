import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { App } from './app'

describe('App', /** Verify that the application stays a thin routing composition root. */ () => {
	it('renders a router outlet without the Nx welcome scaffold', /** Bootstrap the minimal root with no feature implementation embedded. */ () => {
		TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] })
		const fixture = TestBed.createComponent(App)
		fixture.detectChanges()
		const root = fixture.nativeElement as HTMLElement
		expect(root.querySelector('router-outlet')).not.toBeNull()
		expect(root.querySelector('ef-hcm-nx-welcome')).toBeNull()
	})
})
