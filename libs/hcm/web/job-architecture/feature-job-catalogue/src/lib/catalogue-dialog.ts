import { DestroyRef, Directive, inject, output, type OnDestroy } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Observable } from 'rxjs'
import type { HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { jobArchitectureErrorMessage } from '@empflowyee/hcm-web-job-architecture-data-access'

/** Shared draft, submit and dismissal behaviour of the Job Catalogue Dialogs. */
@Directive()
export abstract class CatalogueDialog<T> implements OnDestroy {
	readonly saved = output<T>()
	readonly closed = output<void>()
	protected readonly destroy = inject(DestroyRef)
	abstract readonly draft: HcmDraft
	protected allowClose = false

	/** Persist one command, closing only after the server confirms it. */
	protected submit(call: Observable<T>): void {
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (result) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(result)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(jobArchitectureErrorMessage(error))
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

	/** Allow the shell's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
