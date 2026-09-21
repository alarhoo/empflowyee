# Marketing runtime configuration reference

Do not create a different Marketing image for DEV, QA and PROD.

Environment-specific public values that browser client components need should be exposed by a deliberately public runtime route, for example `/api/runtime-config`, whose response is created from server runtime environment variables.

Do not place environment-varying values in `NEXT_PUBLIC_*` unless you intentionally accept build-time inlining and therefore a different artifact per environment.
