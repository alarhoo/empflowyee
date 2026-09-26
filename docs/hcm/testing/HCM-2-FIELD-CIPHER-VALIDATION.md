# Field cipher validation

Branch: `codex/hcm-2-field-cipher`, started from `codex/hcm-2-job-catalogue`. It carries delivery
step 3 of the [HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order): the
`FieldCipher` port and local key handling under
[ADR-HCM-FIELD-ENCRYPTION](../adr/ADR-HCM-FIELD-ENCRYPTION.md), which is accepted for local
implementation. It was delivered before step 12 because Positions and Position Requirements
store encrypted reasons, comments and justifications. No app is released by this step.

## Delivered

- **`000025_field_cipher_keys.sql`.** Table `tenant_field_key` holds one wrapped data key per
  tenant and key version, with the reference of the key-encryption key that wrapped it. It
  has forced RLS; the runtime may SELECT and INSERT, never UPDATE or DELETE.
- **Port** (`hcm-api-runtime-application`): `FieldCipher.bind(transaction, tenantId)` returns
  `encrypt(target, plaintext)` and `decrypt(target, sealed)`. A target is the table, column and
  row id of the value; a sealed value is ciphertext plus key version. Domains depend on the port
  only.
- **Local implementation** (`hcm-api-runtime-infrastructure`):
  - Values use AES-256-GCM with a random 96-bit nonce. The associated data is the tenant,
    table, column, row id and key version, so a value copied elsewhere fails authentication.
  - The first encryption in a tenant creates a random data key, wraps it with the local
    key-encryption key and stores it. Unwrapped keys are cached in process memory only.
  - A key wrapped by a different key-encryption key is refused by reference before any
    decryption is attempted.
  - `createFieldCipher` returns the local cipher only when `APP_ENVIRONMENT=local` and
    `HCM_LOCAL_FIELD_KEY` is set. Otherwise every use fails as a technical error, so no
    deployed environment stores values until the Cloud KMS custody is reviewed.
  - `HcmRuntimeModule` provides and exports `FieldCipher`.
- **Local key.** `pnpm dev:hcm-api` generates `.local/hcm/field-key` once (mode 0600, ignored
  by Git) and passes it to the API. Losing it makes locally encrypted values unreadable.

## Open points

- Rotation (a new key version and re-encryption of older values) and the reveal audit of
  restricted values arrive with the first app that needs them.
- Sensitive and Restricted custom profile values in My Profile still refuse writes; enabling
  them is an app change for a later slice.

## Verification

Recorded on 2026-09-26 against disposable PostgreSQL 17.

- `libs/hcm/api/runtime/module/src/lib/field-cipher.database.spec.ts`: 3 tests pass. They
  cover:
  - a round trip, including after a restart, with a new nonce per encryption, one wrapped
    key per tenant and no plaintext or key material stored;
  - refusal of a value moved to another row or column, opened in another tenant, tampered
    with, or quoting an unknown key version;
  - refusal of another key-encryption key, the unavailable cipher outside local or without
    a key, and no runtime UPDATE on keys (`42501`).
- `database.integration.spec.ts` lists the new table. Lint for the runtime projects and the
  `hcm-api` build pass.

## Reproduction

```bash
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/runtime libs/hcm/api/database/kysely
```
