# HCM AI App Factory

## App implementation pipeline

```text
app code
  ↓
compile canonical app/domain context
  ↓
approved FDD
  ↓
approved TDD
  ↓
readiness gate: zero blocking decisions
  ↓
feature branch
  ↓
contracts/DTOs
  ↓
SQL migrations + RLS + seed changes
  ↓
Kysely persistence
  ↓
NestJS domain/application/transport
  ↓
API integration tests
  ↓
Angular data-access
  ↓
Angular business feature using approved floorplan/UI5 controls
  ↓
E2E + security + tenant-isolation + architecture review
  ↓
traceability sync
  ↓
PR
```

## Contract-first clarification

The physical database must exist before an API can return persisted data, but transport contracts are designed before persistence because a database row is not an API DTO.

Implementation order is therefore **contract → migration/persistence → API → UI**.

## No-assumption gate

Open decisions are classified as:

- `BLOCKS_THIS_APP`
- `BLOCKS_LATER_CAPABILITY`
- `RESOLVED`

Only `BLOCKS_THIS_APP` prevents implementation. The agent must ask the user rather than invent an answer.
