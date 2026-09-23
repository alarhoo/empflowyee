# HCM-1 scope and business decisions

Status: local stage approved; access and document/notification decisions pending.
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
on that evidence. This response does not resolve DEC-HCM1-002 or DEC-HCM1-003.

## Decisions

| ID           | Classification          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-HCM1-000 | RESOLVED                | Keep production authentication and external integrations out of the current phase, per the explicit scope choice above.                                                                                                                                                                                                                                                                                                      |
| DEC-HCM1-001 | RESOLVED                | The product owner approved the 20-app local stage on 2026-09-24. Review all 20 local-app designs before implementation in small slices. Keep the six named deferred apps Planned and full HCM-1 completion blocked; the owning roadmap now records this scoped exception. Evidence: explicit answer "Approve the 20-app local stage (Recommended)" to the delivery-split question referencing HCM-1-LOCAL-DELIVERY.md.       |
| DEC-HCM1-002 | BLOCKS_THIS_APP         | Approve the proposed authority matrix: David administers accounts/roles and safe audit metadata; Toby manages worker documents; self-service is own-account/person only; Michael gains no reporting-line access yet. Administrators may delegate approved roles without dual approval, with reasons/audit and last-administrator protection. This blocks access/identity commands and all dependent business APIs.           |
| DEC-HCM1-003 | BLOCKS_THIS_APP         | Approve the bounded document/notification behavior: PDF/PNG/JPEG up to 10 MiB, employee visibility explicitly set by HR, employee submission only against their own request, manual Open/Submitted/Completed/Cancelled lifecycle, plain-text in-app event notifications and no user-facing deletion. Production retention/delivery remain deferred. This blocks document and notification designs within the proposed stage. |
| DEC-HCM1-004 | BLOCKS_LATER_CAPABILITY | Production IdP, credentials, session inventory/revocation, security-policy enforcement and external delivery need their own reviewed contracts and trust-boundary decisions before the deferred apps can be implemented. This is not a waiver for those apps.                                                                                                                                                                |
| DEC-HCM1-005 | BLOCKS_LATER_CAPABILITY | Account-to-HCM projection synchronization, production file storage/scanning, retention/legal hold and generic approval workflows remain separately designed capabilities. No local success claims their production readiness.                                                                                                                                                                                                |

The classifications refer to the **approved local stage**. An app-level decision
register must classify prerequisites against that app's actual scope: for example,
DEC-HCM1-004 is a current blocker for SSO Configuration, not a harmless later item.

## Concrete review options

1. **Delivery — resolved:** the 20-app local stage and its roadmap exception are
   approved. All 20 app designs still require review before implementation.
2. **Access:** accept the proposed administrator/HR/self-service matrix and
   single-administrator delegation policy, or specify the authority/approval
   differences. No manager hierarchy is available in the approved foundation.
3. **Documents and notifications:** accept the proposed small local file/request
   scope and in-app-only delivery, or specify the required lifecycle, visibility
   and file policy. Detailed UX/technical designs follow that choice.

Review [the full policy proposal](../domain/HCM-1-LOCAL-PLATFORM-PROPOSAL.md) before
resolving entries. Record the actual decision and evidence here, then prepare the
app documents. Keep catalogue approval flags false until those documents and
blueprints themselves have been reviewed through the
[readiness process](../engineering/APP-READINESS.md).
