# Authentication Boundaries

Authentication is intentionally separate across product surfaces.

Serving a web application's HTML, JavaScript and public runtime configuration does not authenticate a user or authorize business operations. The four DEV web apps are directly browser-accessible under [ADR: DEV web browser access](../adr/ADR-dev-web-browser-access.md). Their APIs retain Cloud Run IAM protection until the application access design is implemented; ordinary frontend delivery must not be confused with successful browser-to-API integration.

## Account

Customer/buyer/account-administrator identity. Supports empFLOWyee-managed email sign-in and common social/workforce providers such as Google/Microsoft.

## HCM

Tenant-specific workforce authentication. The tenant admin chooses/configures the organization authentication strategy during onboarding. Employees authenticate according to that tenant configuration.

The initial purchaser may exist as both an Account principal and an HCM employee/admin principal; these are related business identities but separate authentication contexts.

## Console

Platform operators only. Customers never use Console.

Preferred direction is workforce identity + MFA for privileged operator access rather than custom password storage. If local credentials are ever required, that requires a dedicated security design/ADR.
