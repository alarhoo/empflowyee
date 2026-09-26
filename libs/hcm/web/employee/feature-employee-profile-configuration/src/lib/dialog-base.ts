import { DestroyRef, Directive, inject, type OnDestroy } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Observable } from 'rxjs'
import { HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { employeeErrorMessage } from '@empflowyee/hcm-web-employee-data-access'
import type { ProfileFieldDetailDto } from '@empflowyee/hcm-employee-contract'

/** Shared draft, submit and dismissal behaviour of the configuration Dialogs. */
@Directive()
export abstract class ConfigurationDialog implements OnDestroy {
	protected readonly destroy = inject(DestroyRef)
	abstract readonly draft: HcmDraft
	protected allowClose = false
	protected abstract emitSaved(field: ProfileFieldDetailDto): void
	protected abstract emitClosed(): void

	/** Persist one command, closing only after the server confirms it. */
	protected submit(call: Observable<ProfileFieldDetailDto>): void {
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (saved) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.emitSaved(saved)
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
			this.emitClosed()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the shell's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
