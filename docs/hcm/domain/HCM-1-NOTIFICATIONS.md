# HCM-1 notifications design

Status: complete design for review under the approved bounded behavior.
Incorporates [shared technical contracts](../tdd/TDD-HCM-1-LOCAL-COMMON.md).

<a id="policy"></a>

## POLICY — Three supported in-app events

Registered immutable event types are `document.requested`, `document.submitted`
and `document.replacement-requested`. Requested/replacement notify enabled accounts
linked to the request worker's person (multiple accounts may exist); submitted
notifies the requesting HR account only, if enabled. Resolve recipients under the
verified tenant, not a caller-supplied arbitrary list. There is no manager/HR-wide
broadcast, external address or email/webhook channel.

One optional category per event type. Missing recipient preference means enabled;
explicit false suppresses that category. Tenant rules may disable an event;
preferences cannot override a disabled rule. Missing recipient accounts or disabled
accounts yield an Undeliverable intent, never create identities. Rules exist only
for the three registered events; administrators can toggle enabled, not write
expressions, destinations or custom event types.

One template per event type, local default language only. Administrators edit title
(1–120) and body (1–1000), plain text with allowed `{requestId}` and `{dueDate}`
placeholders. Null dueDate renders an empty value; requestId is opaque, not a secret.
Reject unknown braces/placeholders, HTML tags, control characters and URL-like
external links; render as text regardless of validation. No rich HTML, remote image,
formula, script, locale fallback or mail merge behavior. Built-in safe plain-text
defaults are inserted by explicit seed/migration configuration tooling, not fake inbox rows.

<a id="data"></a>

## DATA — Intent and inbox persistence

Add notification_template keyed `(tenant_id,event_type)` with title, body, revision
and update actor/time. Add notification_rule keyed identically with enabled/revision.
Add notification_preference keyed `(tenant_id,account_id,event_type)` with enabled,
revision and update time; default reads have revision 0 until first explicit save.
First save uses expectedRevision 0; subsequent saves require the current revision.
This documented initial exception does not relax positive stored revision checks.

Add notification_intent `(tenant_id,id)`, event_id, event_type, source_request_id,
recipient_account_id nullable, recipient_key (account ID or explicit no-recipient
sentinel), outcome Delivered/Suppressed/Undeliverable, reason_code and created_at.
Unique `(tenant_id,event_id,recipient_key)`; event occurrence IDs distinguish a
later replacement cycle from a retried command. Add notification `(tenant_id,id)`,
intent_id unique within tenant, recipient_account_id, event_type, title, body,
source_request_id, created_at, read_at nullable, revision. Composite tenant account
FKs; no plaintext file names or document bodies. Add notification_command_receipt.

For this local stage, event-recipient resolution, validated template rendering,
preference/rule snapshot, intent and inbox insert happen synchronously through
notifications' application port bound to the document command transaction.
Outcome is final for that event; later preference/template changes do not rewrite
existing notifications. There is no background queue, timer, worker identity or
cross-tenant polling process. This avoids introducing another authentication
boundary while delivering persistent, idempotent local notifications.

If notification persistence fails, roll back the document command; disabled/missing
recipient is an explicit business outcome and does not roll back the document.
RLS and tenant FKs apply to every table. Runtime has SELECT/INSERT/UPDATE only on
preferences/templates/rules and read-state columns; intent/inbox bodies immutable.
Index inbox tenant/recipient_account_id/created_at/id and unread predicate; prefer
cursor pagination over loading all notifications. No normal DELETE.

<a id="contract"></a>

## CONTRACT — DTOs and ports

NotificationItem `{id,eventType,title,body,requestId,createdAt,readAt,revision}`.
Read command `{expectedRevision}` sets readAt once; a retry never resets the
timestamp. Own inbox has no accountId query. Preferences response
`{items:[{eventType,enabled,revision}]}` contains exactly three registered types.
TemplateDto `{eventType,title,body,revision}`; RuleDto `{eventType,enabled,revision}`.
Template preview is local plain-text substitution using explicitly typed sample
values, never a send endpoint or persisted fake inbox event. Saves use the server
validation contract and audit old/new field names, not complete text bodies.

`RecordDocumentNotification` is an internal notifications application port whose
input is verified event context plus event ID/type/request ID/due date/worker person/
requester account. The document domain remains owner of recipient facts; identity
lookups and template rendering are isolated in bound adapters. Intent status is
operational evidence; it is not exposed as another unplanned application.

<a id="dependencies"></a>

## DEPENDENCIES — Producer and route behavior

Inbox/preferences can be implemented before document event producers and remain
honestly empty. Template/rule screens expose only the supported in-app channel.
An inbox link to Document Requests must pass its own discoverability and business
scope checks; do not embed a bypass URL or automatically mark an app Available.
If that route is not implemented yet, display the notification without an enabled
navigation action. In the completed local stage, self-service request discovery
must be added to the employee catalogue as part of the reviewed app metadata change.

<a id="test"></a>

## TEST — Domain proof obligations

Each event goes to exactly its defined recipients; no other same-tenant account
can list/mark a notification read. Toggle rule/preference and test suppression,
missing account, disabled requester, duplicate event, retry and partial transaction
failure. Existing notification text survives later template edits. Reject external
URLs/HTML/unknown placeholders and enforce backend read-state revisions.
