# Claude repository entry point

Read `AGENTS.md` first. It is the universal engineering constitution.

For HCM work, then read only the context required by the task:

1. `docs/hcm/roadmap/HCM-CARRY-FORWARD.md`
2. canonical HCM catalogue/launchpad/domain catalogue under `docs/hcm/catalogue/`
3. the requested wave/app context and its approved FDD/TDD/ADR/domain documents
4. the applicable `.ai/agents/`, `.ai/skills/` and `.ai/workflows/`
5. the existing implementation in `libs/hcm/{contracts,api,web}` before generating new projects

Rules for HCM execution:

- Current repository architecture is authoritative. Do not introduce historical-version provenance or migration context.
- Ask the human only for genuine unresolved business/product decisions. AI authors routine FDD/TDD/implementation documents.
- Business screens are theme-agnostic. Use approved floorplans and maintained UI5/Fundamental controls; no arbitrary visual CSS.
- Apply `.ai/skills/hcm-data-presentation/SKILL.md` to every business screen.
- Production features use real PostgreSQL -> Kysely -> NestJS -> DTO -> Angular data flow.
- Preserve Nx boundaries and thin app roots.
- Do not create Storybook/Theme Lab work unless explicitly requested.
- Do not run broad freeze/refactor/review passes unless explicitly requested; validate the changed slice and its dependencies.
- Use granular branches and coherent commits; avoid one giant wave commit.
