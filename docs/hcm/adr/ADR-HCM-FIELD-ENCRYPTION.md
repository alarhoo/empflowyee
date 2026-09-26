# ADR: HCM field-level encryption for sensitive values

Status: **Proposed**. Drafted during HCM-2 preparation. Requires architecture and
security review before any HCM-2 slice stores an encrypted column.

## Context

HCM-2 domain documents require encrypted storage for specific values. These values
must stay unreadable to database readers, backups, logs, search indexes and audit
summaries:

- sensitive or restricted custom profile field values;
- position requirement waive justifications;
- position change reasons and decision comments.

Later statutory work adds identification values that also need equality lookups
for duplicate detection. HCM-1 introduced no encryption capability.
PostgreSQL RLS isolates tenants but does not protect values from privileged
database access or backups.

## Decision

1. **Application-level envelope encryption.** The API encrypts before writing and
   decrypts only inside an authorized use case. Values use AES-256-GCM with a random
   96-bit nonce and the tenant ID, table, column and row ID as associated data.
   A ciphertext copied to another row or tenant fails authentication.
2. **Key hierarchy.** Each tenant has data keys wrapped by a key-encryption key.
   Production uses Google Cloud KMS. The wrapped data key lives in an HCM-owned
   table. Local development uses a key supplied through the local API
   environment, never committed and never valid outside `APP_ENVIRONMENT=local`.
3. **Stored shape.** Each encrypted column is `bytea` ciphertext plus a
   `key_version integer` column. Masked display values, when the model defines
   them, are stored separately and computed at write time.
4. **Equality lookup.** When duplicate detection is approved, a blind index uses
   HMAC-SHA-256 with a separate tenant-scoped key. It supports exact match only,
   never prefix or fuzzy search.
5. **Ownership.** The capability is platform-owned inside HCM:
   `hcm-api-runtime` gains a `FieldCipher` port. Domains depend on the port, not
   on KMS or crypto primitives. Kysely rows carry ciphertext only.
6. **Reveal.** Decrypted values leave the API only through a DTO whose app TDD
   names the permission and purpose. A reveal of a restricted value appends a
   `sensitive-access` audit event without the value.
7. **Rotation.** New writes use the newest key version. A later operational job
   re-encrypts older versions; readers accept every non-retired version.

## Consequences

- Encrypted values cannot be sorted, filtered or searched in SQL. App designs
  must not promise that.
- Losing a key-encryption key loses data. Production needs KMS key protection and
  backup policy before enablement.
- Adds a new trust dependency on Cloud KMS for production. The runtime service
  account needs encrypt and decrypt permission on the tenant key ring only. This
  is an IaC change that needs separate review.

## Alternatives considered

- **pgcrypto in SQL.** Rejected because keys or plaintext would pass through SQL
  parameters and logs.
- **Cloud SQL disk encryption only.** Insufficient because it does not protect
  against database readers or exports.
- **No encryption; restrict access only.** Rejected by the current domain rules.
