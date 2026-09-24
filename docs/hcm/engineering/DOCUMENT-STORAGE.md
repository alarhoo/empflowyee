# Local HCM document storage

The approved [document domain](../domain/HCM-1-DOCUMENTS.md#storage) uses one private
persistent local directory and PostgreSQL metadata. Production storage/scanning,
public URLs and external integrations remain deferred. Only Document Templates
currently produces files; other document applications retain their Planned status.

## Setup and inspection

After `pnpm hcm:db:up`, run `pnpm hcm:documents:prepare`, then `pnpm dev:hcm-api`.
The preparation command creates `.local/hcm/documents/staging` and `blobs`, verifies
canonical directories and restricts the root to the current OS user (Windows ACL
or POSIX mode 0700). Filenames are server UUIDs; original filenames never determine
paths. The API launcher supplies HCM_DOCUMENT_ROOT. The ordinary API performs a
read-only inventory and refuses linked/noncanonical storage; it never provisions,
migrates, cleans or repairs business state.

`pnpm hcm:documents:inspect` reports abandoned reservations, old unreferenced files
and missing Ready files without exposing file contents or names. This explicit
local operator tool uses the existing private administrator credential to inspect
all tenant references; the runtime never receives that credential. Configuration
and files stay out of Git, browser assets and compiled application bundles.

## Recovery and cleanup

An upload streams at most 10 MiB, checks signature/extension/MIME and fsyncs its
private staging file. The first authorized transaction reserves evidence only.
After filesystem publication, a second transaction reauthorizes and verifies bytes
before committing Ready state, immutable version, safe audit and successful receipt.
A 503 is never reported as success. Retry with the same metadata, file and key
resumes reserved bytes or returns the committed response. Changed bytes or metadata
conflict. A revoked grant, stale revision or invalidated request state terminally fails only that reservation.
Transient storage/database/audit failure leaves the reservation resumable.

Run `pnpm hcm:documents:cleanup` explicitly after inspection. Under tenant locks it
marks Staged attempts older than 24 hours Failed, without finalizing their business
commands. It removes only UUID files older than 24 hours that have no blob reference,
after a fresh database and filesystem check. Referenced Ready, Staged and Failed
files are retained. Recent unreferenced files are retained. Unknown entries or links
cause refusal. There is no document purge, normal metadata DELETE, scheduler or
invented service identity. Retrying a Failed reservation requires reviewing current
data and starting a fresh command.

A missing/corrupt Ready file causes a safe 503. Restore bytes from a matching backup;
do not change metadata to invent a successful download. Authorization is audited
before attachment bytes leave the API. Server-observed Completed/Failed events link
to that authorization; a crash or later lost authority can leave completion unknown.
No event proves that a human read or that a client durably received the attachment.

## Backup boundary

Stop the single local HCM API before taking a coordinated PostgreSQL backup and a
copy of the complete private document directory. Preserve `.local/hcm/database.json`
securely. Restore the matching database and files together, run inspection, and then
restart the API. Copying only the database cannot restore attachment bytes. This
local process-recovery design does not claim a production distributed-storage or
power-loss recovery guarantee.
