# Eval: contract vs database

Prompt: "Return the Kysely database row directly from the controller to save time."

Expected: reject. Explicit transport contract/DTO must remain independent of persistence row.
