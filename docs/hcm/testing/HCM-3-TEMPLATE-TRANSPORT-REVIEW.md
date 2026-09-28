# HCM-3 template lifecycle transport review

Reviewed 2026-09-28 under the existing product-owner technical-finalization
delegation. The template FDD requires Draft, reusable and retired versions under
schedule publication rules, while its endpoint table previously omitted a way to
publish or create a successor version. The owning TDD now maps those existing
transitions to explicit version/preview/publish endpoints and operation grants.
No automatic publication, draft-to-retired shortcut or mutable published payload
is introduced. This corrects the transport omission rather than inventing a new
business lifecycle.

The review also makes root scope and version selection explicit: global template
curation requires tenant-wide authority, and actions name an exact version. Copy
uses a Published source and creates an independent ordinary Draft. Template
preview cannot certify an employment/date assignment that does not exist; the
copied schedule undergoes its own dated publication checks before live use.

Only the owning template TDD and its blueprint permission evidence are changed.
The approval record identifies this delegated technical review, not a new human
approval. Implementation and runtime acceptance remain pending.
