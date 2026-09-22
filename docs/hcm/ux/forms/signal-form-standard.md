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

Storybook must include valid, invalid, saving, server-error and read-only examples.

## Implemented library

Import `HcmFormActions` and `mapServerValidation` from `@empflowyee/hcm-web-ux-forms`. The feature owns its typed signal model and Angular `form()` tree. Bind UI5 Input using `[formField]`; the installed Fundamental wrapper exposes an Angular ControlValueAccessor supported by FormField's compatibility path. UI5 Form/FormItem owns layout. Do not add a parallel Reactive Forms model.

Pass dirty, valid, saving and readOnly to HcmFormActions. Handle saveRequested, cancelRequested and editRequested in the feature. Save is guarded while invalid, unchanged or submitting. Cancel on a dirty form requires explicit discard confirmation. This protects this action path; route leave protection is a separate feature responsibility.

Use Angular `submit()` to coordinate submission state and returned validation errors. Pass an explicit safe field-name-to-field-tree map to mapServerValidation; unknown server field names become form-level errors. Never traverse arbitrary paths supplied by a backend. The feature must display form-level errors as well as field errors and obtain authoritative business validation from its API.

The **Forms/Signal Form** workshop uses a local typed profile fixture. It demonstrates valid/invalid, saving, read-only/edit, save/reset, cancel/discard and mapped server errors. Saving and server errors are in-memory simulations; there is no HTTP request. The story supplies accessible labels, touched-field messages and UI5 value states. A production form must add its own transport, cross-field/async validation when required, and navigation guard.

Run `pnpm nx test hcm-web-ux-forms` for action/error-mapping tests and the [Storybook test runner](../storybook.md#build-and-test) for browser save/cancel/validation interactions.
