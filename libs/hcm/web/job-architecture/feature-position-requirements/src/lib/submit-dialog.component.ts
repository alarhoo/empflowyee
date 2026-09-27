import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnInit,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	PositionsApi,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type { PositionChangeRequestDto } from '@empflowyee/hcm-job-architecture-contract'

/** Confirmation Dialog: calculates the impact preview, shows it, and submits against it. */
@Component({
	selector: 'ef-hcm-position-submit-dialog',
	imports: [
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Text,
		MessageStrip,
		BusyIndicator,
		HcmDatePipe,
	],
	templateUrl: './submit-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmitDialog implements OnInit {
	readonly request = input.required<PositionChangeRequestDto>()
	readonly saved = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	/** One retry key per step, kept for this Dialog. */
	private readonly keys = { preview: crypto.randomUUID(), submit: crypto.randomUUID() }
	readonly previewed = signal<PositionChangeRequestDto | null>(null)
	readonly busy = signal(true)
	readonly error = signal('')
	/** Whether a variance waives a requirement. */
	readonly isWaive = (item: { varianceType: string }): boolean => item.varianceType === 'Waive'

	/** Calculate the preview when the Dialog opens. */
	ngOnInit(): void {
		const request = this.request()
		this.api
			.preview(request.id, { expectedRevision: request.revision }, this.keys.preview)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Show the preview. */ (result) => {
					this.previewed.set(result)
					this.busy.set(false)
				},
				error: /** Explain; nothing was submitted. */ (error) => {
					this.error.set(jobArchitectureErrorMessage(error))
					this.busy.set(false)
				},
			})
	}

	/** Submit against the shown preview. */
	submit(): void {
		const previewed = this.previewed()
		if (!previewed?.preview || this.busy()) return
		this.busy.set(true)
		this.error.set('')
		this.api
			.submit(
				previewed.id,
				{ previewId: previewed.preview.id, expectedRevision: previewed.revision },
				this.keys.submit,
			)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close after commit. */ () => {
					this.busy.set(false)
					this.saved.emit('Proposal submitted for approval.')
				},
				error: /** Keep the Dialog open and explain. */ (error) => {
					this.busy.set(false)
					this.error.set(jobArchitectureErrorMessage(error))
				},
			})
	}

	/** Close without submitting; the preview simply expires. */
	cancel(): void {
		this.closed.emit()
	}
}
