# Cloud Run access baseline

All Cloud Run services are private by default.

This foundation does not grant `allUsers` invocation and does not enable IAP yet.

That is deliberate: Marketing/customer-facing surfaces, Console, and APIs have different trust requirements, and production should eventually be exposed through the approved edge topology instead of ad-hoc Cloud Run URLs.

Do not make an individual service public merely to fix a local connectivity issue. Public ingress and authentication are architecture decisions.
