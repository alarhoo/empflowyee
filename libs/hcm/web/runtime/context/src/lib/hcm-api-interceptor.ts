import { DOCUMENT } from '@angular/common'
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http'
import { Injector, effect, inject } from '@angular/core'
import { Observable, throwError } from 'rxjs'
import { HcmRuntimeStore } from './hcm-runtime.store'

/** Scope development selection to the same-origin HCM API and cancel work when verified context changes. */
export const hcmApiInterceptor: HttpInterceptorFn = (request, next) => {
	const document = inject(DOCUMENT),
		runtime = inject(HcmRuntimeStore),
		injector = inject(Injector)
	const url = new URL(request.url, document.baseURI),
		origin = document.location?.origin
	if (url.origin !== origin || !url.pathname.startsWith('/api/v1/'))
		return next(request.clone({ headers: request.headers.delete('X-HCM-Development-Persona') }))
	// Runtime bootstrap owns its explicit selector while the ready business context is absent.
	if (url.pathname.startsWith('/api/v1/runtime/')) return next(request.clone({ redirect: 'error' }))
	const context = runtime.context()
	if (!context)
		return throwError(
			/** Fail closed before issuing a business request during context replacement. */ () =>
				new HttpErrorResponse({ status: 401, error: { code: 'unauthenticated' } }),
		)
	let headers = request.headers.delete('X-HCM-Development-Persona')
	if (context.development?.personaId)
		headers = headers.set('X-HCM-Development-Persona', context.development.personaId)
	return new Observable(
		/** Tie this subscription and every result to the context captured at dispatch. */ (
			observer,
		) => {
			const subscription = next(request.clone({ headers, redirect: 'error' })).subscribe({
				next: /** Discard any late event belonging to the previous tenant/account. */ (event) => {
					if (runtime.context() === context) observer.next(event)
				},
				error: /** Do not render an obsolete context's failure in the next persona. */ (error) => {
					if (runtime.context() === context) observer.error(error)
					else observer.complete()
				},
				complete: /** Finish the owned request stream. */ () => observer.complete(),
			})
			const guard = effect(
				/** Cancel in-flight transport immediately after context replacement. */ () => {
					if (runtime.context() !== context) {
						subscription.unsubscribe()
						observer.complete()
					}
				},
				{ injector, manualCleanup: true },
			)
			return /** Release the context watcher together with the HTTP subscription. */ () => {
				guard.destroy()
				subscription.unsubscribe()
			}
		},
	)
}
