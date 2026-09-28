# Workflow & Approvals — Business Rules

1. Source domain is authoritative for subject validity, required approval, decision and state; no Workflow row or operator command may directly update source tables.
2. Candidate, assignment, claim, task visibility, manager relationship and escalation are discovery facts only and grant no action authority.
3. One current open workflow generation exists for a source subject case/accepted manifest; a material version/digest change invalidates old pending work and never copies an action.
4. Same idempotency key plus same normalized input returns the durable result; same key plus different input is a conflict across intake, claim, action, dispatch and timer effects.
5. An action attempt never completes a task. Only a verified `Accepted` source receipt for the exact task/slot/expected generation may complete it.
6. Unknown dispatch outcome remains pending/quarantined until source query proves a durable result; timeout alone never causes retry under a new key or a guessed terminal state.
7. Every action rechecks current non-pooled authority, source case/stage/slot/version, subject/requester distinction, authenticated-session validity and domain guards; routing snapshots may not satisfy that check.
8. A user cannot act on their own subject/request where source policy requires independence, and distinct slots must be filled by distinct users where the manifest requires it.
9. Published definitions and their child graph are immutable, their effective ranges cannot overlap, and existing instances retain their accepted graph/digest.
10. Workflow conditions use allow-listed fact codes/operators and exactly one typed operand; executable expressions, scripts, arbitrary URLs and untyped condition payloads are forbidden.
11. Definition compilation and candidate resolution are deterministic for the same subject facts, source versions, current authority snapshot and as-of instant.
12. A stage/task/route can only use action/fact/route capabilities registered for the exact compatible subject-contract version and within its sensitivity ceiling.
13. Stage threshold configuration must be satisfiable by required distinct slots; optional/parallel task completion never allows the workflow mirror to declare a domain result independently.
14. A task has at most one active assignment. Claim/reassignment uses expected version; release/revocation retains the ended assignment and cannot erase candidate history.
15. Candidate refresh may remove expired/ineligible candidates and cancel their active assignment, but an already dispatched action is reconciled rather than silently discarded.
16. No-candidate or escalation fallback may only reach currently eligible candidates or the restricted operations queue; there is no implicit tenant-administrator, superuser or hierarchy fallback.
17. Escalation can notify, reroute discovery or request source expiry, but cannot approve/reject, create permission/delegation, weaken separation of duty or force task completion.
18. Duration basis and business-calendar version are fixed by the accepted definition/manifest; retained due instant is UTC and is never recalculated from a viewer's locale.
19. Queue row, count, search, cache, notification, export and error predicates must not reveal a task or source existence beyond the viewer's current discovery/field access.
20. Stored task title/summary, action reason and sensitive fact are minimized and encrypted; they are absent from logs, metrics, ordinary notifications and unrestricted exports.
21. Registered deep links are route codes resolved by trusted product configuration; tenant/source input cannot supply an arbitrary redirect URL.
22. When workflow mirror and source disagree, authenticated source state wins; correction resynchronizes/closes the mirror and never changes source state to match workflow.
23. Terminal attempts, receipts and task events are append-only; correction adds linked evidence. User/domain deletion never cascades these rows.
24. Every tenant query, worker claim, cache key, outbox event and adapter request carries tenant context; cross-tenant subject/reference correlation is forbidden.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
