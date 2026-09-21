import { TestBed } from '@angular/core/testing'
import { App } from './app'
import { NxWelcome } from './nx-welcome'

describe('App', /** Group rendering checks for the account application root. */ () => {
	beforeEach(
		/** Compile the standalone application and welcome components in a fresh Angular test module. */ async () => {
			await TestBed.configureTestingModule({
				imports: [App, NxWelcome],
			}).compileComponents()
		},
	)

	it('should render title', /** Render the application and verify the account welcome heading. */ () => {
		const fixture = TestBed.createComponent(App)
		fixture.detectChanges()
		const compiled = fixture.nativeElement as HTMLElement
		expect(compiled.querySelector('h1')?.textContent).toContain('Welcome account-web')
	})
})
