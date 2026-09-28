# HCM-3 shared functional requirements

Status: approved functional baseline, 2026-09-28. These requirements are incorporated by each
HCM-3 app FDD. Approval provenance is in HCM-3-DESIGN-APPROVAL.md; implementation remains gated by readiness.

<a id="common-auth"></a>

## COMMON-AUTH — Current authority

Every operation requires a server-verified tenant, enabled account, current
business permission, entitlement and independently evaluated subject scope.
Select an employment only from the actor's authorized employments; concurrent
employments never share balances or attendance. Self selection is not an actor
override. Team membership is the current effective workforce relationship,
intersected with an explicit permission. A task, reporting line or planner
assignment cannot create permission. One qualifying grant must cover the whole
operation; partial scopes from different grants cannot be pooled.

Decisions additionally require the current domain case, stage, slot, subject
revision, independence and a valid authenticated session. Recheck inside the decision transaction,
including actions initiated by Workflow. Direct and consolidated approval
screens call the same domain decision authority. Missing operation permission
denies before object lookup; hidden tenant/subject references return an
existence-hiding result. Revoked grants affect counts and searches as well as
detail reads. See the [foundation gaps](HCM-3-FOUNDATION-DESIGN.md#reconciliation).

<a id="common-ux"></a>

## COMMON-UX — Interaction and validation

All screens use real API data and truthful loading, empty, unavailable,
permission-denied, error/retry and read-only states. Clear data on tenant/account
switch and discard late responses. Keep a failed draft and field errors; dirty
navigation asks before discarding. Keyboard navigation, focus restoration,
accessible labels and 390/768/1440/2560-width behavior are acceptance criteria.

Rich collections preserve list/detail context in page-backed FCL. Complex
configuration and multi-section requests use dedicated create/edit routes;
dialogs hold only a short, focused action. Date-range agendas use maintained
calendar/date controls plus accessible lists/tables. Drag-and-drop scheduling
and a custom calendar grid are not assumed requirements.

New forms use Signal Forms with matching universal-contract and server
validation. The owning TDD field matrices define requiredness,
whitespace behavior, length/range, format, choices and cross-field conditions.
Names and reasons allow Unicode; do not silently truncate or sanitize values.
Required reasons reject whitespace-only input. Date values remain calendar
dates, timestamps show an explicit zone, enums use a closed selection, units
use exact decimal strings; worked time retains milliseconds and rational minutes. Published policy supplies
business bounds. Missing policy inputs block publish/preview with field errors.
Errors appear after blur/submit, update on correction and focus the first invalid
field. Invalid forms send no request; direct invalid API requests also fail.

Use DatePicker, TimePicker/DateTimePicker, Select/ComboBox, CheckBox, TextArea,
FileUploader, native Form/FormItem and maintained tables. Business states use
inverted Fundamental ObjectStatus with a text label; preference-aware formatting
owns dates and numbers. No feature CSS, custom status colors or definition-list
business layouts. The shell applies the shared canvas once.

<a id="common-commit"></a>

## COMMON-COMMIT — Durable outcomes

Commands return success only after their transaction commits. Persist the domain
result, audit correlation, idempotency receipt and required outbox work together.
Identical actor/operation/key/input replay returns the durable result; changed
input under the key conflicts. Expected revision and preview digests reject stale
commands. Parallel requests cannot double spend a balance, decide a task twice,
post duplicate accrual or apply the same evidence twice.

Background progress is explicit: pending, running, failed and completed states
are never substituted for one another. An unknown downstream outcome stays
pending reconciliation. Recovery uses the original business key. Published
definitions, source events, ledger postings and accepted decisions retain their
original content; corrections append linked evidence.

<a id="common-privacy"></a>

## COMMON-PRIVACY — Purpose-specific projections

Calendars and ordinary queues expose only the authorized identity, date/time,
safe status and registered link needed for the task. They omit leave reasons,
medical labels, balances, evidence, IP, coordinates, device assertions and
restricted diagnostics. Counts, search, sorting and exports use the same field
and row policy. Medical evidence is not an ordinary approver download; the
approver sees an evidence-satisfied indicator.

Documents owns bytes, access/storage lifecycle and cleanliness enforcement;
business domains own purpose and attachment relationships. Audit owns append
and sensitive-access evidence. Notifications owns preferences, templates,
recipient decisions and inbox messages. Production external delivery and finite
retention/legal-hold packs remain explicitly deferred. Local development uses
non-sensitive seeded/test evidence, not a claim of production privacy approval.

<a id="common-acceptance"></a>

## COMMON-ACCEPTANCE — Required proof

Every app must cover its numbered FDD requirements plus: direct API authorization;
cross-tenant and same-tenant out-of-scope denial; concurrent employment selection;
revocation between preview and command; same/different idempotency payload;
rollback between domain/audit/outbox/receipt writes; safe pagination/counts;
empty/error/dirty states; semantic validation and keyboard/responsive behavior.
Read-only apps test that no mutation route is exposed. Tests are planned here,
not claimed executed. Shared worker crash/replay proofs are required by consuming
apps, rather than duplicated in each feature test suite.

## CURRENT-BOUNDARIES

Apply the approved decision register: no universal minimum-rest rule; no new
step-up infrastructure; Unpaid LOP has no consumable account/reservation; units-only
encashment configuration is supported with real submission/handoff disabled.
Overtime remains disabled until qualification/caps/pre-approval are configured.
Direct/candidate-offer tasks require no claim; reassignment cannot grant authority.
