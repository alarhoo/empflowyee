# HCM-1 scope and business decisions

Status: local stage, access authority and bounded document/notification behavior approved.
App design revisions are complete for review; implementation remains gated.
These entries are not app
approval ledgers. Resolution of the choices below enables detailed app design;
it does not manufacture reviewed FDD/TDD/blueprint hashes.

## Confirmed scope

On 2026-09-24, the product owner selected: “Keep production authentication and
external integrations deferred” when asked whether to expand HCM-1 to production
authentication, SSO, API credentials, email delivery and outbound webhooks.
Evidence: explicit user reply in the HCM-1 preparation task. This approves the
exclusion, not the unreviewed business policies below.

On the same date, the product owner explicitly selected “Approve the 20-app local
stage (Recommended)” in response to the delivery-split question naming all six
deferred apps and the change to the all-26 design gate. DEC-HCM1-001 is resolved
on that evidence. A subsequent explicit user instruction approved the access authority matrix and
bounded document/notification behavior: “Approve the proposed HCM-1 access authority
matrix and the proposed bounded document/notification behavior.” This resolves
DEC-HCM1-002 and DEC-HCM1-003. That instruction also requested all 20 design packages
and explicitly prohibited application implementation. Evidence: the design-finalization
request in this task on 2026-09-24; it is not review of the subsequently authored bytes.

## Decisions

| ID           | Classification          | Decision                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-HCM1-000 | RESOLVED                | Keep production authentication and external integrations out of the current phase, per the explicit scope choice above.                                                                                                                                                                                                                                                                                                |
| DEC-HCM1-001 | RESOLVED                | The product owner approved the 20-app local stage on 2026-09-24. Review all 20 local-app designs before implementation in small slices. Keep the six named deferred apps Planned and full HCM-1 completion blocked; the owning roadmap now records this scoped exception. Evidence: explicit answer "Approve the 20-app local stage (Recommended)" to the delivery-split question referencing HCM-1-LOCAL-DELIVERY.md. |
| DEC-HCM1-002 | RESOLVED                | Approved by the explicit design-finalization request above: David administers accounts/roles and safe audit; Toby manages worker documents; self-service is own-account/person; Michael has no reporting-line scope. Delegation requires reason/audit and last-administrator protection, without a second approver.                                                                                                    |
| DEC-HCM1-003 | RESOLVED                | Approved by the same explicit request: PDF/PNG/JPEG up to 10 MiB, HR-controlled employee visibility, own-request employee submission, manual request transitions, plain-text in-app notifications and no user-facing deletion. Production retention/delivery stay deferred.                                                                                                                                            |
| DEC-HCM1-004 | BLOCKS_LATER_CAPABILITY | Production IdP, credentials, session inventory/revocation, security-policy enforcement and external delivery need their own reviewed contracts and trust-boundary decisions before the deferred apps can be implemented. This is not a waiver for those apps.                                                                                                                                                          |
| DEC-HCM1-005 | BLOCKS_LATER_CAPABILITY | Account-to-HCM projection synchronization, production file storage/scanning, retention/legal hold and generic approval workflows remain separately designed capabilities. No local success claims their production readiness.                                                                                                                                                                                          |

The classifications refer to the **approved local stage**. An app-level decision
register must classify prerequisites against that app's actual scope: for example,
DEC-HCM1-004 is a current blocker for SSO Configuration, not a harmless later item.

## Design review

The three requested business choices are resolved. The [20-app design index](HCM-1-DESIGN-REVIEW.md)
links the completed packages, technical selections and readiness results. New
FDD/TDD/blueprint revisions still require their actual review evidence under the
[readiness process](../engineering/APP-READINESS.md). No business question is left
open merely to defer technical design work. No application implementation is
authorized by the design-only request.
