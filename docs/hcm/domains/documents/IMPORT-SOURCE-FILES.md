# Documents — import source files

Status: complete design for review. This additive design extends the
[HCM-1 documents design](../../domain/HCM-1-DOCUMENTS.md#storage) for HCM-2
Employee Import. It does not change any approved HCM-1 behavior, file type or
sharing rule.

<a id="policy"></a>

## POLICY — Purpose-limited staged files

- A new blob purpose `import-source` accepts only CSV (`text/csv`, UTF-8, with or
  without BOM) and XLSX
  (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). The
  maximum size is 5 MiB. Content signatures are checked server-side; extension and
  browser MIME type are not trusted.
- Import source blobs are never employee documents. They do not appear in My
  Documents, Employee Documents, templates or requests. They have no download
  route for employees and no sharing flag.
- Only the Employee import application service may create or read them, bound to
  one `employee_import_run` row in the same tenant.
- XLSX parsing reads cell values only. Formulas are not evaluated, external links
  are ignored, and macro-enabled or encrypted workbooks are rejected. Only the
  first worksheet is read. Parsing runs with row, column, cell-length and
  decompressed-size limits to prevent archive expansion attacks.
- Retention and disposition follow DEC-HCM2-013 and are not implemented locally.

<a id="data"></a>

## DATA — Storage changes

- Reuse `document_blob` and `document_upload_attempt` with the staged, Ready and
  reconciliation lifecycle from HCM-1.
- Extend the allowed purpose and content-type CHECK constraints through a forward
  migration owned by documents, delivered before `000026_employee_import.sql`.
- `employee_import_run.source_blob_id` references `document_blob(tenant_id, id)`.

<a id="contract"></a>

## CONTRACT — Port

`DocumentStoragePort.stageImportSource(unitOfWork, {runId, fileName, bytes})`
returns `{blobId, sha256, sizeBytes, contentType}`.
`openImportSource(unitOfWork, blobId)` returns a bounded stream for the parser.
Both are in `hcm-api-documents-application` and never exposed over HTTP by
documents.

<a id="test"></a>

## TEST

- Reject spoofed extensions, macro-enabled and encrypted workbooks, oversize and
  decompression-bomb files.
- Import source blobs never appear in any documents list or download endpoint.
- A cross-tenant or cross-run blob reference is rejected.
