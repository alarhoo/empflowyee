-- Ownership: database foundation. Bookkeeping only; no business or tenant records.
CREATE TABLE hcm.development_seed_history (
  dataset text NOT NULL CHECK (dataset = 'dunder-mifflin'),
  module_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  checksum text NOT NULL CHECK (length(checksum) = 64),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (dataset, module_id, version)
);

REVOKE ALL ON hcm.development_seed_history FROM PUBLIC, hcm_runtime;
