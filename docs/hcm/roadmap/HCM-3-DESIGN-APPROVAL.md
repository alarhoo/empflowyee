# HCM-3 design approval and finalization authority

## AUTHORITY

Source: product-owner message in this HCM-3 preparation conversation, 2026-09-28,
beginning “Approve the HCM-3 Step-1 product decisions with the following
resolutions.” The owner explicitly resolved decisions 003–008, 010–016 and
019–021, kept 001/002/009/017/018 as later-capability gates, and instructed:

> finalize/approve the FDD designs;
> author and finalize all owning TDDs;
> finalize exact routes and floorplans;
> create the real BLUEPRINT evidence;
> update catalogue FDD/TDD/blocker summaries only from the reviewed documents;
> run all per-app and HCM-3 readiness checks again.

The owner also directed: “Do NOT begin HCM-3 implementation until the readiness
checks pass” and “Ask me again only if a genuinely new business decision remains
unresolved.” The complete resolved behavior is in the
[decision register](HCM-3-DECISIONS.md#decisions).

## SCOPE

This is product approval of the specified business behavior and an explicit
delegation to Codex to finalize and technically review the resulting FDDs, TDDs,
routes, floorplans and blueprints. It is **not** a claim that the human separately
read documents created after that instruction. Approval ledgers identify this
delegated finalization provenance and bind the resulting reviewed bytes to this
instruction. Codex is the technical author/reviewer; the approving authority is
the product owner in this conversation. No independent reviewer or PR approval
is invented.

This explicit instruction governs this preparation instead of requiring another
human approval round for routine technical authoring. A material new business
choice would fall outside the delegation. None is introduced by the final design.

The accepted worker ADR authorizes one shared HCM background runtime and its
internal workload context. It does not authorize cloud provisioning, an IAM
rollout, production step-up authentication, monetary handoff, or a new product.
All 23 apps remain Planned until implementation and acceptance. Readiness means
approved design inputs, not completed code, executed business tests or production
certification. Dependency states in blueprints mean design-resolved; foundation
implementation still precedes each consuming app.

## REVIEW

Technical review checks every app against the resolved decisions, current owner
ports and SQL identity model; source-domain approval authority; exact API/DTO and
field validation; RLS/index/immutability design; native page/semantic controls;
worker recovery and test traceability. Each finalized TDD names these sections.
Hash records are generated only after that content review and formatting.
Subsequent semantic edits require renewed review within this delegation or new
product approval if they change business behavior. Do not blindly refresh hashes.

The final readiness/validation record lists the actual executed commands and
their results. Planned tests are explicitly distinguished from executed tests.

Review timestamps use the actual UTC calendar date in APPROVALS.json. Document
dates and the product-owner session date use Asia/Calcutta. During this review
2026-09-28 local time was still 2026-09-27 UTC; this is not backdated approval.
