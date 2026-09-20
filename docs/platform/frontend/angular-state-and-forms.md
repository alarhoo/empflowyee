# Angular State, Forms, and Change Detection

## State

New Angular application state should prefer Signals:

- `signal()` for local writable state
- `computed()` for derived state
- `effect()` only for true side effects

RxJS remains appropriate for asynchronous streams, cancellation/concurrency orchestration, WebSockets, and library APIs that naturally expose Observables.

## Forms

Angular 22 Signal Forms are the default for new forms.

Use Reactive Forms only when:

- a third-party integration cannot be implemented safely with Signal Forms, or
- a TDD records a concrete reason.

## Change detection baseline

Although Angular 22 defaults toward zoneless operation, empFLOWyee Angular applications initially keep Zone.js enabled.

Reason: the approved component ecosystems are still completing/validating zoneless compatibility, especially enterprise table/layout behavior. We will use Signals and Signal Forms now without taking unnecessary runtime compatibility risk.

Zoneless adoption requires:

1. verified HCM Fundamental/UI5 compatibility,
2. verified Account Spartan compatibility,
3. verified Console PrimeNG compatibility,
4. E2E/visual regression coverage for critical controls,
5. an ADR approving the change.
