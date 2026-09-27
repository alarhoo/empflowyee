# Documents import source validation

Branch: `codex/hcm-2-documents-import-source`, started from `codex/hcm-2-employment-changes`. It
carries the documents part of delivery step 15 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order), implementing the
[import source design](../domains/documents/IMPORT-SOURCE-FILES.md).

## Behavior and review

- **Migration `000030_document_import_sources.sql`** (planned as the documents extension before
  `000026`; see the [delivery record](../roadmap/HCM-2-DELIVERY.md)) adds `document_blob.purpose`
  (`document` or `import-source`). A document keeps its PDF, PNG and JPEG types; an import source
  is `text/csv` or the XLSX type and at most 5 MiB. Triggers refuse an import source behind a
  template version, employee document version, request submission or upload attempt, so it can
  never appear in a documents list or download route.
- **`DocumentStoragePort`** in `hcm-api-documents-application` binds an `ImportSourceStore` to the
  caller's transaction: `stageImportSource({runId, fileName, bytes})` returns
  `{blobId, sha256, sizeBytes, contentType}`, and `openImportSource(blobId)` reads a Ready import
  source of the caller's tenant, bounded to 5 MiB. Documents exposes neither over HTTP; the
  documents module exports the port for Employee Import.
- **Content decides the type.** The extension and browser type are not trusted: a workbook must
  be a zip archive, a CSV must be strict UTF-8 without NUL bytes, and either mismatch is refused.
- **Bounded reading.** CSV follows RFC 4180 with or without a BOM. XLSX reads the first worksheet's
  cell values only: shared and inline strings, and formula cells as their cached value, never
  evaluated. External links are ignored. Macro-enabled (a VBA project or macro content type) and
  encrypted workbooks (an OLE container or an encrypted entry) are refused, zip64 is refused, and
  every entry inflates within a budget and must match its stated size, so a decompression bomb
  fails safely. Rows, columns and cell length are bounded; each refusal has a safe code and never
  carries file content.

## Open points

- A staged file whose business transaction rolls back leaves unreferenced bytes in private storage
  and no row; reconciling such bytes follows the HCM-1 storage reconciliation, not implemented
  locally.
- Retention and disposition follow DEC-HCM2-013 and are not implemented locally.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17.

- `libs/hcm/api/documents/application/src/lib/import-source-reader.spec.ts`: 4 tests pass for CSV
  with BOM, quotes and CRLF; invalid encoding; the first worksheet with shared, inline and formula
  cells; spoofed, macro-enabled, encrypted and oversized files; and a decompression bomb and row,
  column and cell limits, using workbooks built in the test.
- `libs/hcm/api/documents/module/src/lib/import-sources.database.spec.ts`: 3 tests pass for staging
  and reading a CSV as a Ready import-source blob in its tenant only, refusing a spoofed file with
  no row written, and the purpose and media-type constraints and triggers.
- The documents module suite passes with 38 tests. `local-document-files.spec.ts` fails on the
  base branch as well in this container (a hard-link check); it is unrelated to this change.
- Lint for the documents projects and the `hcm-api` build pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/documents
```
