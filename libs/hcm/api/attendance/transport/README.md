# hcm-api-attendance-transport

Maps the admitted `/api/v1/attendance/schedule-templates` endpoints to owning
application services. Authenticated runtime context and existing origin, media,
idempotency and safe-error handling apply to every request. Exact version queries
are mandatory on content mutations. No SQL or source business decisions live here.
