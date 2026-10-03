# hcm-api-runtime-application

Owns safe discovery projection and independent lifecycle, session expiry and tenant membership enforcement.

See the [shell maintainer guide](../../../../../docs/hcm/architecture/shell/README.md). The HCM API build compiles this non-buildable library. Boundary integration tests run with `pnpm nx test hcm-api-runtime-module`.

Internal durable human-action references preserve the original verified session
expiry and exact intent/permission/scope binding. They do not authorize an action
without current source and Access checks. See the [integration evidence](../../../../../docs/hcm/testing/HCM-3-WORKFLOW-INTEGRATION.md#durable-action-authority-review).
