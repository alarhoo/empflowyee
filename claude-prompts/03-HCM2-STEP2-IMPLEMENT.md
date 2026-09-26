# Claude task — HCM-2 Step 2: implement approved design

Prerequisite: HCM-2 Step 1 FDD/TDD/readiness is approved with zero blocking decisions.

Read `CLAUDE.md`, `AGENTS.md`, `docs/hcm/roadmap/HCM-CARRY-FORWARD.md`, the approved HCM-2 FDD/TDDs/blueprints, current domain code, and the applicable AI skills/workflows.

Implement HCM-2 in the approved order.

Execution rules:

1. Build shared domain foundations/contracts/migrations before apps that depend on them.
2. Use SQL-first migrations + RLS + seed updates, Kysely persistence, NestJS domain/application/infrastructure/transport/module, runtime-universal DTOs, Angular data-access, then Angular feature.
3. Business screens consume real APIs. No frontend business fixtures.
4. Use the TDD-selected floorplan and `.ai/skills/hcm-data-presentation/SKILL.md`.
5. Rich list/detail uses FCL/Object Page where approved. Small focused forms may use Dialog; complex create/register flows use dedicated routes/pages; staged flows use Wizard.
6. No HER/Horizon imports, raw colors, deep UI5 styling, custom business-screen layout CSS, `dl/dt/dd`, or generic inputs where maintained semantic controls exist.
7. Backend authorization/RLS remains authoritative. Navigation/route visibility is not authorization.
8. Work in granular app/domain branches/slices and make coherent commits (contracts/data/API/UI/tests) instead of one giant HCM-2 commit.
9. After each app slice, run affected checks and update catalogue/traceability. Do not stop for a broad freeze/review cycle.
10. Ask the human only if a genuine unresolved business decision is discovered; otherwise continue through the approved HCM-2 implementation plan.

At the end report completed apps, migrations, APIs, UI routes/floorplans, tests, commits, and any carry-forward items.
