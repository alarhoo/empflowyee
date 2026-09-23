# HCM application catalogue

`hcm-app-catalogue.json` is the canonical inventory of HCM apps.

`hcm-launchpad.json` owns visual placement in Spaces, Pages and Sections.

`hcm-domain-catalogue.json` summarizes code ownership by business domain.

Rules:

- visual placement never changes domain ownership;
- app folders are domain-owned;
- route/floorplan remain unset until approved TDD;
- business features are theme-agnostic;
- production business data always comes through real API contracts;
- no historical provenance metadata belongs in the current catalogue.

Run `pnpm hcm:catalogue:validate` from the repository root to check identities,
domain-owned paths, policy fields and reciprocal navigation references. Context
tools read only the canonical current JSON, never alternate inventories.

`discoveryPolicy.permission` and `discoveryPolicy.entitlement` are explicit
navigation capabilities. They do not finalize business API permissions. Canonical
business-role membership places Spaces and supplies local persona discovery
capabilities; tenant licensing remains independent of the selected persona.

The launchpad consumes the checked projection in the runtime contract's
`/catalogue` entry point. After editing canonical metadata, run
`pnpm hcm:catalogue:generate`; `pnpm hcm:catalogue:check` rejects drift. Every current
app has at least one Page/Group placement. Planned apps remain visible according to
discovery policy and share one unavailable dialog. See the
[launchpad design](../tdd/TDD-HCM-0-LAUNCHPAD.md).

The supplied `hcm-app-catalogue.v3.json`, `launchpad-layout.v2-reference.json`,
`ownership-overrides.json` and CSV inventory are noncanonical reference artifacts.
Do not use them as requirements/design inputs or copy their provenance fields into
current documents. Change current approved metadata directly; do not regenerate it
from reference inventories.
