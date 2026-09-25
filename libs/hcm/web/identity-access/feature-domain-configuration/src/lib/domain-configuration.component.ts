import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { ListItemCustom } from '@fundamental-ngx/ui5-webcomponents/list-item-custom'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { Subscription } from 'rxjs'
import { IdentityApi } from '@empflowyee/hcm-web-identity-access-data-access'
import type { DomainProjection } from '@empflowyee/hcm-identity-access-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'

@Component({
	selector: 'ef-hcm-domain-configuration',
	imports: [
		List,
		ListItemCustom,
		Link,
		ObjectStatusComponent,
		Label,
		FormItem,
		Form,
		Page,
		Bar,
		Title,
		Button,
		MessageStrip,
		Text,
	],
	templateUrl: './domain-configuration.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DomainConfigurationComponent {
	private readonly api = inject(IdentityApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly data = signal<DomainProjection | null>(null)
	readonly busy = signal(false)
	readonly error = signal('')
	/** Clear prior tenant data and cancel obsolete reads on every context replacement. */
	constructor() {
		effect(
			/** Track only the verified runtime context. */ () => {
				this.runtime.context()
				untracked(/** Reload independently of the local view signals. */ () => this.load())
			},
		)
	}
	/** Read the actual current projection; unavailable services never masquerade as empty data. */
	load(): void {
		this.request?.unsubscribe()
		this.data.set(null)
		this.error.set('')
		this.busy.set(true)
		this.request = this.api
			.domains()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only the current successful server projection. */ (data) => {
					this.data.set(data)
					this.busy.set(false)
				},
				error: /** Classify safe access denial separately from retryable service errors. */ (
					error: unknown,
				) => {
					this.error.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'This session no longer has access to domain information.'
							: 'Domain information could not be loaded. Retry when the service is available.',
					)
					this.busy.set(false)
				},
			})
	}
}
