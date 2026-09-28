# Workflow & Approvals — Domain Model

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

Workflow is a reusable coordination layer. It mirrors source-domain work and routes/action-delivers it without becoming the authority for the source business decision.

## Product registry and definition

```text
Workflow Subject Type
  -> versioned Subject Contract
      -> allowed Actions
      -> declared safe Facts

Workflow Definition
  -> immutable published Definition Version
      -> ordered Stages
          -> Task Definitions
              -> allowed Actions
              -> typed Conditions
              -> Routing Rules
              -> Escalation Rules
```

## Runtime coordination

```text
Source case/version
  -> Workflow Instance
      -> safe fact snapshot
      -> Stage Instances
          -> Tasks
              -> candidates
              -> at-most-one active assignment
              -> allowed task actions
              -> durable timers/events
              -> action attempt -> dispatch -> authenticated receipt
      -> reconciliation exceptions
```

## Authority boundary

- Source domain owns subject validity, calculations, approval slots, decisions and terminal business state.
- Workflow stores only public/source references, expected versions, minimum safe projection and coordination evidence.
- Candidate/assignment discovery is never permission. Every action rechecks source-domain permission/scope/slot/version/session.
- Workflow does not invent an approval on timeout, escalation, timer fire or failed/no-candidate routing.
- Authenticated source state wins during reconciliation.

## HCM-3 source contracts

Leave and Attendance are the first required source-domain adapters. `MY_APPROVALS` consolidates actionable source approval tasks, while `APPROVE_LEAVES` and `APPROVE_ATTENDANCE` remain the richer domain-specific decision experiences.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
