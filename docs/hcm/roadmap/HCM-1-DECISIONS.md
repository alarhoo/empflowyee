# HCM-1 scope and business decisions

Status: review register for the proposed local stage. These entries are not app
approval ledgers. Resolution of the choices below enables detailed app design;
it does not manufacture reviewed FDD/TDD/blueprint hashes.

## Confirmed scope

On 2026-09-24, the product owner selected: “Keep production authentication and
external integrations deferred” when asked whether to expand HCM-1 to production
authentication, SSO, API credentials, email delivery and outbound webhooks.
Evidence: explicit user reply in the HCM-1 preparation task. This approves the
exclusion, not the unreviewed business policies below.

## Decisions

| ID           | Classification          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-HCM1-000 | RESOLVED                | Keep production authentication and external integrations out of the current phase, per the explicit scope choice above.                                                                                                                                                                                                                                                                                                      |
| DEC-HCM1-001 | BLOCKS_THIS_APP         | Approve a named 20-app local delivery stage with stage-wide reviewed designs, leaving six apps Planned and the complete HCM-1 wave blocked. The existing all-26 wave-readiness rule otherwise prevents starting local implementation. Recommended stage and exact app coverage are in the local delivery plan.                                                                                                               |
| DEC-HCM1-002 | BLOCKS_THIS_APP         | Approve the proposed authority matrix: David administers accounts/roles and safe audit metadata; Toby manages worker documents; self-service is own-account/person only; Michael gains no reporting-line access yet. Administrators may delegate approved roles without dual approval, with reasons/audit and last-administrator protection. This blocks access/identity commands and all dependent business APIs.           |
| DEC-HCM1-003 | BLOCKS_THIS_APP         | Approve the bounded document/notification behavior: PDF/PNG/JPEG up to 10 MiB, employee visibility explicitly set by HR, employee submission only against their own request, manual Open/Submitted/Completed/Cancelled lifecycle, plain-text in-app event notifications and no user-facing deletion. Production retention/delivery remain deferred. This blocks document and notification designs within the proposed stage. |
| DEC-HCM1-004 | BLOCKS_LATER_CAPABILITY | Production IdP, credentials, session inventory/revocation, security-policy enforcement and external delivery need their own reviewed contracts and trust-boundary decisions before the deferred apps can be implemented. This is not a waiver for those apps.                                                                                                                                                                |
| DEC-HCM1-005 | BLOCKS_LATER_CAPABILITY | Account-to-HCM projection synchronization, production file storage/scanning, retention/legal hold and generic approval workflows remain separately designed capabilities. No local success claims their production readiness.                                                                                                                                                                                                |

The classifications refer to the **proposed local stage**. An app-level decision
register must classify prerequisites against that app's actual scope: for example,
DEC-HCM1-004 is a current blocker for SSO Configuration, not a harmless later item.

## Concrete review options

1. **Delivery:** accept the proposed local stage and record the exception in the
   roadmap, or retain the current all-26 rule and finish the deferred integration
   designs before any HCM-1 implementation.
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
