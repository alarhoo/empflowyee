# HCM Signal Forms standard

New HCM Angular forms use Angular Signal Forms unless a TDD records a justified exception.

## Responsibility split

```text
UI5 controls / Form
    → visual inputs and responsive layout
Angular Signal Forms
    → field state, validation, dirty/touched/submission state
Feature
    → use-case behavior and save/cancel orchestration
Data-access
    → HTTP calls and DTO mapping
Backend
    → authoritative validation/business rules
```

## Mandatory behaviors

- typed form model
- synchronous and asynchronous validation as required
- cross-field validation when required
- dirty-state tracking
- unsaved-change protection where losing data is meaningful
- save/cancel semantics
- read/edit mode when specified by FDD
- server validation/error mapping
- accessible labels/descriptions/errors
- no duplicated business rules that belong exclusively on the backend

## Field restrictions and feedback

Before implementing a form, record each field's requiredness, data type, length or
numeric range, accepted format/allowed choices, whitespace normalization and
cross-field dependencies in the owning TDD. Use existing contract rules and
explicitly resolve missing business restrictions; sample data is not a policy.

- Apply supported native limits (`maxlength`, `min`, `max`, `step`, selectable
  options) and appropriate input types. Email/Tel types select input affordances;
  they do not validate syntax. Inspect the installed wrapper's public properties.
- Put shared, synchronous shape/length validators and limits in the owning
  runtime-universal contract. Use them in Signal Forms and server create/update
  commands. Do not copy regexes into templates or leave validation to Save-only flags.
- Recompute validity when values, selected input types or conditional requiredness
  change. Show errors after blur or submission and clear them immediately when
  corrected. Keep field-level messages visible and associated with the input using
  accessible descriptions; native popup feedback alone is insufficient.
- Validate before constructing/sending a command, mark invalid fields touched and
  focus the first invalid control. Preserve the draft. Server validation is mandatory
  even when the browser supplies input restrictions.
- Do not silently sanitize invalid values into valid ones or manually truncate
  existing values when a field type changes. Native typing limits coexist with
  validation of pasted/programmatic/previously stored values. Phone length counts
  digits separately from display punctuation; numeric fields validate magnitude.
- Test empty and whitespace values, exact and exceeded bounds, malformed formats,
  paste, type changes, optional-to-required transitions and error correction. Assert
  that invalid submission makes no HTTP request and direct API calls also reject it.
  Valid syntax does not establish contact ownership or reachability.

My Profile's concrete email and phone rules are recorded in its
[TDD](../../apps/my-profile/TDD.md#contact-input-validation).

Storybook must include valid, invalid, saving, server-error and read-only examples.

## Implemented library

Import `HcmFormActions` and `mapServerValidation` from `@empflowyee/hcm-web-ux-forms`. The feature owns its typed signal model and Angular `form()` tree. Bind UI5 Input using `[formField]`; the installed Fundamental wrapper exposes an Angular ControlValueAccessor supported by FormField's compatibility path. UI5 Form/FormItem owns layout. Do not add a parallel Reactive Forms model.

Pass dirty, valid, saving and readOnly to HcmFormActions. Handle saveRequested, cancelRequested and editRequested in the feature. Save is guarded while invalid, unchanged or submitting. Cancel on a dirty form requires explicit discard confirmation. This protects this action path; route leave protection is a separate feature responsibility.

Use Angular `submit()` to coordinate submission state and returned validation errors. Pass an explicit safe field-name-to-field-tree map to mapServerValidation; unknown server field names become form-level errors. Never traverse arbitrary paths supplied by a backend. The feature must display form-level errors as well as field errors and obtain authoritative business validation from its API.

The **Forms/Signal Form** workshop uses a local typed profile fixture. It demonstrates valid/invalid, saving, read-only/edit, save/reset, cancel/discard and mapped server errors. Saving and server errors are in-memory simulations; there is no HTTP request. The story supplies accessible labels, touched-field messages and UI5 value states. A production form must add its own transport, cross-field/async validation when required, and navigation guard.

Run `pnpm nx test hcm-web-ux-forms` for action/error-mapping tests and the [Storybook test runner](../storybook.md#build-and-test) for browser save/cancel/validation interactions.

For installed UI5 2.26 DatePicker controls, add `HcmDateField` from this library
alongside `[formField]`. It configures the maintained wrapper accessor to consume
native `change`, when the parsed date is committed. The native `input` event still
contains the previous date and must not overwrite the Signal Form while typing.
Keyboard/paste and calendar behavior remain native. See [Holiday date binding
review](../../apps/holiday-calendars/TDD.md#date-binding-and-field-restrictions) and
its executed browser evidence. Domain date validation remains unchanged.
