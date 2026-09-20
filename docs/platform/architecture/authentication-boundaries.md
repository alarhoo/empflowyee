# Authentication Boundaries

Authentication is intentionally separate across product surfaces.

## Account

Customer/buyer/account-administrator identity. Supports empFLOWyee-managed email sign-in and common social/workforce providers such as Google/Microsoft.

## HCM

Tenant-specific workforce authentication. The tenant admin chooses/configures the organization authentication strategy during onboarding. Employees authenticate according to that tenant configuration.

The initial purchaser may exist as both an Account principal and an HCM employee/admin principal; these are related business identities but separate authentication contexts.

## Console

Platform operators only. Customers never use Console.

Preferred direction is workforce identity + MFA for privileged operator access rather than custom password storage. If local credentials are ever required, that requires a dedicated security design/ADR.
