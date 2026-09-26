import { signal } from '@angular/core'

/**
 * Draft lifecycle shared by structure dialogs and routed editors: dirty tracking against the loaded
 * baseline, an explicit discard decision, and one idempotency key per distinct submitted command.
 */
export class StructureDraft {
	readonly confirmOpen = signal(false)
	readonly saving = signal(false)
	readonly error = signal('')
	private baseline = ''
	private resolveDiscard?: (discard: boolean) => void
	private attempt?: { signature: string; key: string }

	/** Observe the current draft value through the owning form model. */
	constructor(private readonly value: () => unknown) {}

	/** Record the loaded or committed value as the clean baseline. */
	markClean(): void {
		this.baseline = JSON.stringify(this.value())
	}

	/** Report whether the draft differs from its baseline. */
	dirty(): boolean {
		return JSON.stringify(this.value()) !== this.baseline
	}

	/** Ask before discarding a dirty draft; a pending write cannot be abandoned. */
	canLeave(): Promise<boolean> {
		if (this.saving()) return Promise.resolve(false)
		if (!this.dirty()) return Promise.resolve(true)
		if (this.resolveDiscard) return Promise.resolve(false)
		this.confirmOpen.set(true)
		return new Promise(
			/** Resolve only after an explicit native-dialog choice. */ (resolve) => {
				this.resolveDiscard = resolve
			},
		)
	}

	/** Complete one discard decision and release the waiting navigation. */
	decide(discard: boolean): void {
		this.confirmOpen.set(false)
		this.resolveDiscard?.(discard)
		this.resolveDiscard = undefined
	}

	/** Reuse the retry key while the command is unchanged; a changed command gets a new key. */
	key(command: unknown): string {
		const signature = JSON.stringify(command)
		if (this.attempt?.signature !== signature)
			this.attempt = { signature, key: crypto.randomUUID() }
		return this.attempt.key
	}

	/** Unblock pending navigation when the owner is destroyed. */
	release(): void {
		this.resolveDiscard?.(false)
		this.resolveDiscard = undefined
	}
}
