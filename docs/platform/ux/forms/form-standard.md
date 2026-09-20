# Enterprise Form Standard

New Angular forms default to Signal Forms.

Every production form must explicitly define:

- create/edit/display mode
- initial loading state
- validation strategy
- cross-field validation
- asynchronous validation
- dirty state behavior
- unsaved-change handling
- submit state
- server validation errors
- field authorization/read-only behavior
- accessibility labels/descriptions
- success/error feedback
- draft behavior if applicable

FDD defines user-visible behavior. TDD defines the form implementation and selected controls.
