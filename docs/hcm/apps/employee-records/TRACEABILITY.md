# Employee Records — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                 | Design                      | Planned test              |
| ----------------------------------------------------------- | --------------------------- | ------------------------- |
| [REQ-EMPLOYEE-RECORDS-001](FDD.md#req-employee-records-001) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYEE-RECORDS-001 |
| [REQ-EMPLOYEE-RECORDS-002](FDD.md#req-employee-records-002) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYEE-RECORDS-002 |
| [REQ-EMPLOYEE-RECORDS-003](FDD.md#req-employee-records-003) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYEE-RECORDS-003 |
| [REQ-EMPLOYEE-RECORDS-004](FDD.md#req-employee-records-004) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYEE-RECORDS-004 |
| [REQ-EMPLOYEE-RECORDS-005](FDD.md#req-employee-records-005) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYEE-RECORDS-005 |
| [REQ-EMPLOYEE-RECORDS-006](FDD.md#req-employee-records-006) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYEE-RECORDS-006 |
| [REQ-EMPLOYEE-RECORDS-007](FDD.md#req-employee-records-007) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYEE-RECORDS-007 |
| [REQ-EMPLOYEE-RECORDS-008](FDD.md#req-employee-records-008) | [TDD#UX](TDD.md#ux)         | TEST-EMPLOYEE-RECORDS-008 |
| [REQ-EMPLOYEE-RECORDS-009](FDD.md#req-employee-records-009) | [TDD#DATA](TDD.md#data)     | TEST-EMPLOYEE-RECORDS-009 |
| [REQ-EMPLOYEE-RECORDS-010](FDD.md#req-employee-records-010) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYEE-RECORDS-010 |

## TEST-EMPLOYEE-RECORDS-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Pending and ended workers are findable; incomplete minimal records are labelled Incomplete, never guessed.

Assert: Search by name, worker number or work email and filter by employment status, legal entity, unit, department, location, worker type and record state.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-002

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: The DTO equals the HR allowlist; emergency-purpose values are absent until revealed.

Assert: Show all HR-visible fields by section, all employments with their dates and statuses, assignment history, reporting lines and a worker event timeline.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Each correction is revisioned and audited with field names; direct edits to employment or assignment fields have no endpoint.

Assert: Correct names, birth date, gender, marital status, nationality, addresses, personal contacts and relationships with a required reason. Employment and assignment facts are read-only here and link to Employment Changes.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: All facts commit together or not at all; worker numbers are unique; a Hired worker event is recorded.

Assert: Create person, worker number, employment, primary assignment and manager line in one staged flow with WorkforceActivation requiredness. Status is Pending for a future hire date and Active otherwise.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-005

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A matching candidate blocks the Review step until a resolution is recorded; name-only matches without birth dates on both sides are not candidates; the resolution and reason are audited.

Assert: Per DEC-HCM2-001, a candidate is an existing person with the same normalized legal name and the same birth date, or an existing employment with the same work email. Normalization ignores case, accents and repeated spaces. Any candidate blocks creation until HR records one resolution: use the existing person (continue in Employment Changes as a rehire when a worker exists), or create new with a reason. Automatic merge is forbidden.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-006

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A reveal without the permission fails; the audit event contains purpose, actor and worker ID, never the values.

Assert: Blood group and emergency contacts are revealed only with the emergency permission and a stated purpose, and each reveal is audited as sensitive access.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-007

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-008

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-009

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-RECORDS-010

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Merging a duplicate with an established employment returns 409 `merge-requires-correction`; a completed merge hides the duplicate from search and keeps its history reachable from the survivor.

Assert: HR may merge a duplicate person into a survivor with a reason. The duplicate becomes inactive with `merged_into_person_id` set, and reads follow the survivor chain. HCM-2 allows the merge only when the duplicate’s worker has no established employment. Merging two engaged histories needs a later correcting design.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
