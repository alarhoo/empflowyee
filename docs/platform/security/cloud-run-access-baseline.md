# Cloud Run access baseline

Cloud Run invocation and application authentication are separate controls. Front-facing web applications must have a normal browser access path; a developer proxy is not their delivery mechanism.

The reusable module remains private by default. [ADR: DEV web browser access](../adr/ADR-dev-web-browser-access.md) approves the following explicit exception in `empflowyee-dev`:

| Services                                                 | DEV invocation                             |
| -------------------------------------------------------- | ------------------------------------------ |
| `marketing-web`, `account-web`, `hcm-web`, `console-web` | Public HTTPS; no Google IAM token required |
| `account-api`, `hcm-api`, `console-api`                  | Google IAM authentication required         |

Terraform owns these settings and disables the invoker IAM check for the four web services. No `allUsers` IAM grant or IAP configuration is needed. The module rejects public invocation outside this explicit DEV web allowlist. QA and PROD remain private pending their separate approved rollout/edge design.

Public web delivery does not authorize business operations. Account/HCM sign-in and tenant authorization, and Console workforce identity/MFA, follow [authentication boundaries](../architecture/authentication-boundaries.md). The current deployed UIs are scaffolds without privileged operations. APIs require an explicit authentication and browser-access design before they expose business endpoints.

Any expansion of public access must update the ADR, Terraform guard and tests. Do not make ad-hoc console/CLI changes that conflict with Terraform.
