# HCM-3 Workforce impact subject review

Codex technical review under existing delegated HCM-3 design authority, 2026-09-28.
The [common foundation contract](../architecture/TDD-HCM-3-COMMON.md#foundations)
extends Workforce-owned read-only ports for bounded impact enumeration. This
introduces no business eligibility rule, cross-product import or new authority.

Reviewed single dated scope selection, employment identity/revision-only projection,
assignment EXISTS deduplication, inclusive employment dates, historical status
neutrality, explicit incomplete-fact candidates, C-collation keysets and RLS.
The source consumer retains authorization, stable transaction/lock ownership and
re-enumeration before publication. A raw internal keyset is never a public cursor.
Executed SQL tests are separate evidence; no new app acceptance is claimed.
