# HCM employee transport

Nest controllers of the employee domain (`hcm-api-employee-transport`). Every route re-authorizes
inside the employee unit of work; writes require same-origin headers and an `Idempotency-Key`.
