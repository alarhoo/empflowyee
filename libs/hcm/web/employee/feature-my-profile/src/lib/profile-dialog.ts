import { DestroyRef, Directive, inject, output, type OnDestroy } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Observable } from 'rxjs'
import type { HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { employeeErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import type { MyProfileDto } from '@empflowyee/hcm-employee-contract'

/** Shared draft, submit and dismissal behaviour of the My Profile Dialogs. */
@Directive()
export abstract class ProfileDialog implements OnDestroy {
	readonly saved = output<MyProfileDto>()
	readonly closed = output<void>()
	protected readonly destroy = inject(DestroyRef)
	abstract readonly draft: HcmDraft
	protected allowClose = false

	/** Persist one command, closing only after the server confirms it. */
	protected submit(call: Observable<MyProfileDto>): void {
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (profile) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(profile)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(employeeErrorMessage(error))
			},
		})
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the page's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
