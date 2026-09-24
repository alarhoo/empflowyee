# HCM-1 local-stage implementation approval

On 2026-09-24 the product owner instructed implementation of the approved local
stage after delivery of design revision `45e06ee`:

> Implement the approved HCM-1 local stage according to the implementation order, one coherent slice at a time. Use feature branches and atomic commits, real PostgreSQL/Kysely data, NestJS APIs, Angular UI5 business screens, tests and review gates. Do not implement the six deferred production-integration apps.

Source: user message in task `01a0cb54-f0fd-7ed3-95b8-743707a97381`.
The app approval ledgers bind this instruction to the reviewed design bytes.
The [delivery plan](HCM-1-LOCAL-DELIVERY.md) defines the 20 admitted apps and six
deferred apps. This approval admits implementation; it does not certify code,
tests, operational readiness, or completion of any application.

Routes and floorplans are now published from the reviewed blueprints. Apps remain
Planned until their individual acceptance and review gates pass. Additional
document-app discovery memberships will ship with forward seed changes in their
implementation slices; applied foundation seed versions remain immutable.
