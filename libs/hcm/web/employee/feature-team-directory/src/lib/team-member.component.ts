import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	TeamDirectoryApi,
	employeeDenied,
	employeeErrorMessage,
	employeeMissing,
} from '@empflowyee/hcm-web-employee-data-access'
import type { TeamMemberDto } from '@empflowyee/hcm-employee-contract'
import { personInitials, personName } from './person-label'
import { EMPLOYMENT_TYPES, WORK_MODES, employmentStatus, probationStatus } from './status'

/** Mid column: one member's placement, employment and probation facts. */
@Component({
	selector: 'ef-hcm-team-member',
	imports: [
		ObjectStatusComponent,
		Avatar,
		Form,
		FormItem,
		Label,
		Text,
		Link,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './team-member.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamMemberComponent {
	readonly workerId = input.required<string>()
	readonly closed = output<void>()
	private readonly api = inject(TeamDirectoryApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly name = personName
	readonly employment = employmentStatus
	readonly probation = probationStatus
	readonly employmentTypes = EMPLOYMENT_TYPES
	readonly workModes = WORK_MODES
	readonly member = signal<TeamMemberDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied' | 'unavailable'>('loading')
	readonly message = signal('')
	readonly avatar = computed(/** Initials. */ () => personInitials(this.member() ?? {}))
	readonly actions = [{ id: 'close', label: 'Close' }]

	/** Reload when the member or the verified context changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.workerId()
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.member.set(null)
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the member. */
	load(): void {
		this.state.set('loading')
		this.message.set('')
		this.request = this.api
			.member(this.workerId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the member. */ (member) => {
					this.member.set(member)
					this.state.set('content')
				},
				error: /** Truthful failure state without stale data. */ (error) => {
					this.message.set(
						employeeMissing(error)
							? 'This person is not in your team.'
							: employeeErrorMessage(error),
					)
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route floorplan actions. */
	action(id: string): void {
		if (id === 'close') this.closed.emit()
	}
}
