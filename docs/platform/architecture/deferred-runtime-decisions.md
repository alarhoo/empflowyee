# Deferred runtime decisions

These decisions are intentionally not invented in the container foundation.

## ORM and database migration mechanism

The PostgreSQL ORM/migration tool has not been selected yet.

Until it is selected:

- API containers must not run automatic schema migrations at startup.
- production migrations must become a separate, auditable deployment step/job.
- schema changes should follow expand/migrate/contract patterns where zero/low-downtime compatibility is required.

## Observability vendor

Structured stdout/stderr is mandatory now. Vendor-specific tracing/APM export is deferred.

## Container vulnerability/SBOM/provenance gates

The release pipeline should later add:

- dependency vulnerability scanning
- image vulnerability scanning
- SBOM generation
- build provenance/attestation where practical

These controls belong in release hardening, not application feature code.

## Production sizing

CPU, memory, concurrency, min/max instances and Cloud SQL pool sizing will be decided using DEV/QA measurements rather than guessed in Dockerfiles.
