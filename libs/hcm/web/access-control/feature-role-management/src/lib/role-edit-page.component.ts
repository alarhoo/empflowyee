import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	signal,
	viewChild,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin, of } from 'rxjs'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { RoleApi, roleErrorMessage } from '@empflowyee/hcm-web-access-control-data-access'
import type { PermissionOption } from '@empflowyee/hcm-access-control-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { RoleEditorComponent, type RoleEdit } from './role-editor.component'

@Component({
	selector: 'ef-hcm-role-edit-page',
	imports: [HcmDynamicPage, RoleEditorComponent],
	template: `@if (edit(); as model) {
			<ef-hcm-role-editor
				[edit]="model"
				[options]="permissions()"
				(closed)="back()"
			></ef-hcm-role-editor>
		} @else {
			<ef-hcm-dynamic-page
				title="Role editor"
				[state]="state()"
				[errorMessage]="message()"
				(retry)="load()"
			></ef-hcm-dynamic-page>
		}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleEditPageComponent {
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly api = inject(RoleApi)
	private readonly destroy = inject(DestroyRef)
	private readonly runtime = inject(HcmRuntimeStore)
	readonly editor = viewChild(RoleEditorComponent)
	readonly edit = signal<RoleEdit | null>(null)
	readonly permissions = signal<PermissionOption[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	/** Load route-specific inputs before exposing the complex form. */
	constructor() {
		this.load()
	}
	/** Resolve a fresh revision and registered choices; never allow a system-role edit surface. */
	load(): void {
		if (!this.runtime.context()?.access.permissions.includes('hcm.access-control.roles.manage')) {
			this.state.set('denied')
			return
		}
		this.state.set('loading')
		const id = this.route.snapshot.paramMap.get('id')
		forkJoin({ role: id ? this.api.get(id) : of(null), permissions: this.api.permissions() })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Bind a single disposable Signal Forms draft to the loaded revision. */ (
					value,
				) => {
					if (value.role?.systemRole) {
						this.state.set('denied')
						return
					}
					this.permissions.set(value.permissions.items)
					this.edit.set({ mode: id ? 'update' : 'create', role: value.role })
				},
				error: /** Keep failed initial loads recoverable without a partial edit model. */ (
					error,
				) => {
					this.message.set(roleErrorMessage(error))
					this.state.set('error')
				},
			})
	}
	/** Guard browser back, shell navigation and persona changes through the same editor decision. */
	canLeave(): Promise<boolean> {
		return this.editor()?.canLeave() ?? Promise.resolve(true)
	}
	/** Return to the collection after an explicit cancel or confirmed successful command. */
	back(): void {
		void this.router.navigate(['/access-control/role-management'])
	}
}
