-- Ownership: workforce-foundation. Lookup Values edits change every field except the code
-- (REQ-LOOKUP-VALUES-002), so runtime may also update a worker type's statutory class and a worker
-- event type's category. requires_approval stays owned by the employment-change approval policy.
GRANT UPDATE (statutory_class) ON hcm.worker_type TO hcm_runtime;
GRANT UPDATE (category) ON hcm.worker_event_type TO hcm_runtime;
