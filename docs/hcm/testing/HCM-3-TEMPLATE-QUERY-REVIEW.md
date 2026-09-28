# HCM-3 template query technical review

Reviewed 2026-09-28 under the product owner's existing technical-finalization
delegation. The admitted list contract requires authenticated cursors, current
authority and source revision checks. Existing generic cursors encode unsigned
JSON with an unkeyed binding hash, so they cannot establish this requirement.

The reviewed Attendance representation uses an unpredictable 256-bit server
handle, storing only its digest under tenant RLS with actor, app and exact
query/authority/revision binding. The handle is not authority and each request
reloads current grants. Fifteen-minute expiry and bounded expired-cache cleanup
keep continuation independent of process memory, API instance and new secret
infrastructure. Runtime's immutable version identities and mandatory revision
increments make the version revision sum monotonic for each configuration family;
source changes invalidate continuation. The exact latest-version filter/sort
semantics are documented in the app TDD before implementation.

This is delegated technical review, not a new business decision or a claim of
implemented acceptance. Database, HTTP and UI evidence must be recorded separately.
