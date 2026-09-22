import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core'
import { FormField, email, form, readonly, required, submit } from '@angular/forms/signals'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/angular'
import { HcmFormActions } from './form-actions.component'
import { mapServerValidation } from './server-validation'

interface ProfileFixture {
	name: string
	email: string
}
const initialProfile: ProfileFixture = { name: 'Alex Morgan', email: 'alex@demo.example' }

/** Demonstrate a feature-owned Signal Form using maintained UI5 inputs and an in-memory save. */
@Component({
	selector: 'ef-hcm-profile-form-story',
	imports: [Form, FormItem, Input, Button, FormField, HcmFormActions],
	template: `
		<section class="workshop-form" aria-label="Signal Form example">
			<h1>Profile presentation fixture</h1>
			<p>Fictional data. Saving affects this story only.</p>
			<ui5-form
				headerText="Contact details"
				[accessibleMode]="readOnly() ? 'Display' : 'Edit'"
				layout="S1 M1 L2 XL2"
			>
				<ui5-form-item>
					<span slot="labelContent">Display name</span>
					<ui5-input
						accessibleName="Display name"
						[formField]="profileForm.name"
						[readonly]="readOnly()"
						[disabled]="profileForm().submitting()"
						[valueState]="
							profileForm.name().invalid() && profileForm.name().touched() ? 'Negative' : 'None'
						"
					/>
					@if (profileForm.name().touched()) {
						@for (error of profileForm.name().errors(); track $index) {
							<p class="workshop-error" role="alert">{{ error.message }}</p>
						}
					}
				</ui5-form-item>
				<ui5-form-item>
					<span slot="labelContent">Email</span>
					<ui5-input
						accessibleName="Email"
						type="Email"
						[formField]="profileForm.email"
						[readonly]="readOnly()"
						[disabled]="profileForm().submitting()"
						[valueState]="
							profileForm.email().invalid() && profileForm.email().touched() ? 'Negative' : 'None'
						"
					/>
					@if (profileForm.email().touched()) {
						@for (error of profileForm.email().errors(); track $index) {
							<p class="workshop-error" role="alert">{{ error.message }}</p>
						}
					}
				</ui5-form-item>
			</ui5-form>
			<ef-hcm-form-actions
				[readOnly]="readOnly()"
				[dirty]="profileForm().dirty()"
				[valid]="profileForm().valid() && !profileForm().pending()"
				[saving]="profileForm().submitting()"
				(saveRequested)="save()"
				(cancelRequested)="cancel()"
				(editRequested)="readOnly.set(false)"
			/>
			@if (scenario() === 'saving') {
				<ui5-button (click)="completeSave?.()">Complete simulated save</ui5-button>
			}
			<p role="status">{{ outcome() }}</p>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class ProfileFormStory {
	readonly scenario = input<'valid' | 'invalid' | 'saving' | 'server-error' | 'read-only'>('valid')
	readonly readOnly = signal(false)
	readonly profile = signal<ProfileFixture>({ ...initialProfile })
	readonly outcome = signal('Editing a local fixture')
	private saved: ProfileFixture = { ...initialProfile }
	completeSave?: () => void
	readonly profileForm = form(
		this.profile,
		/** Define presentation validation; the fake save represents authoritative server validation. */ (
			path,
		) => {
			required(path.name, { message: 'Display name is required.' })
			required(path.email, { message: 'Email is required.' })
			email(path.email, { message: 'Enter a valid email address.' })
			readonly(path, {
				when: /** Make display mode consistent across all Signal Form fields. */ () =>
					this.readOnly(),
			})
		},
	)

	/** Initialize deterministic states when a different Storybook scenario is selected. */
	constructor() {
		effect(
			/** Keep scenario initialization separate from form-value edits. */ () => {
				const scenario = this.scenario()
				untracked(
					/** Initialization must not resubscribe the scenario effect to field and submit state. */ () => {
						this.readOnly.set(scenario === 'read-only')
						if (scenario === 'invalid') {
							this.profileForm().reset({ name: '', email: 'invalid-address' })
							this.profileForm().markAsTouched()
						}
						if (scenario === 'saving' || scenario === 'server-error') {
							this.profileForm().markAsDirty()
							void this.save()
						}
					},
				)
			},
		)
	}

	/** Run the Signal Forms submission lifecycle and map a deterministic fake rejection to the email field. */
	async save(): Promise<void> {
		const success = await submit(
			this.profileForm,
			/** Simulate latency and return field-scoped validation without HTTP. */ async () => {
				await new Promise<void>(
					/** Allow a stable saving story or finish a normal fake save shortly. */ (resolve) => {
						if (this.scenario() === 'saving') this.completeSave = resolve
						else setTimeout(resolve, 200)
					},
				)
				if (this.scenario() === 'server-error')
					return mapServerValidation(
						[{ field: 'email', message: 'This fixture email is already registered.' }],
						{ email: this.profileForm.email },
						this.profileForm,
					)
				return undefined
			},
		)
		if (!success) return
		this.saved = { ...this.profile() }
		this.profileForm().reset(this.saved)
		this.readOnly.set(true)
		this.outcome.set('Saved locally')
	}

	/** Restore the saved snapshot after the action component receives explicit discard confirmation. */
	cancel(): void {
		this.profileForm().reset({ ...this.saved })
		this.readOnly.set(true)
		this.outcome.set('Changes discarded')
	}
}

const meta: Meta<ProfileFormStory> = {
	title: 'Forms/Signal Form',
	component: ProfileFormStory,
	args: { scenario: 'valid' },
}
export default meta
type Story = StoryObj<ProfileFormStory>

export const Valid: Story = {}
export const Invalid: Story = { args: { scenario: 'invalid' } }
export const Saving: Story = { args: { scenario: 'saving' } }
export const ServerValidation: Story = {
	args: { scenario: 'server-error' },
	play: /** Verify that fake server validation is shown beside the bound field. */ async ({
		canvasElement,
	}) => {
		await expect(
			await within(canvasElement).findByText('This fixture email is already registered.'),
		).toBeVisible()
	},
}
export const ReadOnly: Story = { args: { scenario: 'read-only' } }
export const SaveChanges: Story = {
	play: /** Exercise the supported UI5-to-Signal-Forms binding and our save orchestration. */ async ({
		canvasElement,
	}) => {
		const control =
			canvasElement.querySelector('ui5-input[accessiblename="Display name"]') ??
			canvasElement.querySelector('ui5-input')
		await waitFor(
			/** Wait for the native input to upgrade before interacting like a keyboard user. */ () =>
				expect(control?.shadowRoot?.querySelector('input')).toBeTruthy(),
		)
		const input = control?.shadowRoot?.querySelector('input')
		if (!input) throw new Error('Display name input is unavailable')
		await userEvent.click(input)
		await userEvent.keyboard('{Control>}a{/Control}{Backspace}')
		await userEvent.type(input, 'Taylor Morgan')
		await userEvent.tab()
		await expect(within(canvasElement).getByText('Unsaved changes')).toBeVisible()
		const save = Array.from(canvasElement.querySelectorAll('ui5-button')).find(
			/** Find the visible feature save action. */ (button) =>
				button.textContent?.trim() === 'Save',
		)
		if (!save) throw new Error('Save action is unavailable')
		await userEvent.click(save)
		await expect(await within(canvasElement).findByText('Saved locally')).toBeVisible()
	},
}
export const CancelChanges: Story = {
	play: /** Dirty edits survive Keep editing and are discarded only after confirmation. */ async ({
		canvasElement,
	}) => {
		const control = canvasElement.querySelector('ui5-input')
		await waitFor(
			/** Wait for the real UI5 text input before typing. */ () =>
				expect(control?.shadowRoot?.querySelector('input')).toBeTruthy(),
		)
		const input = control?.shadowRoot?.querySelector('input')
		if (!input) throw new Error('Display name input is unavailable')
		await userEvent.type(input, ' edited')
		await userEvent.tab()
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByText('Cancel', { exact: true }))
		await expect(canvas.getByText('Discard your unsaved changes?')).toBeVisible()
		await userEvent.click(canvas.getByText('Keep editing', { exact: true }))
		await expect(input).toHaveValue('Alex Morgan edited')
		await userEvent.click(canvas.getByText('Cancel', { exact: true }))
		await userEvent.click(canvas.getByText('Discard changes', { exact: true }))
		await expect(canvas.getByText('Changes discarded')).toBeVisible()
		await waitFor(
			/** The native control renders the reset Signal Form value asynchronously. */ () =>
				expect(control?.shadowRoot?.querySelector('input')).toHaveValue('Alex Morgan'),
		)
	},
}
export const Phone: Story = { globals: { viewport: { value: 'phone', isRotated: false } } }
