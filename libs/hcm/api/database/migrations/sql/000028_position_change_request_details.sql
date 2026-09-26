-- Position change request details the Positions API carries: the name and solid line a Create or
-- Change proposes (a null line proposes none; names are not versioned), and the requester's withdrawal reason. The withdrawal reason,
-- like the request reason, is ciphertext under ADR-HCM-FIELD-ENCRYPTION, visible only to the
-- requester and approvers.
ALTER TABLE hcm.position_change_request
  ADD COLUMN proposed_name text CHECK (length(btrim(proposed_name)) BETWEEN 1 AND 150),
  ADD COLUMN proposed_reports_to_position_id text,
  ADD COLUMN encrypted_withdrawal_reason bytea,
  ADD COLUMN withdrawal_reason_key_version integer CHECK (withdrawal_reason_key_version > 0),
  ADD CONSTRAINT position_change_request_reports_to FOREIGN KEY (tenant_id,proposed_reports_to_position_id) REFERENCES hcm.position(tenant_id,id),
  ADD CONSTRAINT position_change_request_name CHECK ((proposed_name IS NOT NULL) = (proposed_position_version_id IS NOT NULL)),
  -- Only a proposal names a solid line, and never to the position itself (business rule 12).
  ADD CONSTRAINT position_change_request_reports_to_proposal CHECK (
    proposed_reports_to_position_id IS NULL
    OR (proposed_position_version_id IS NOT NULL AND proposed_reports_to_position_id <> position_id)),
  ADD CONSTRAINT position_change_request_withdrawal CHECK (
    (encrypted_withdrawal_reason IS NULL) = (withdrawal_reason_key_version IS NULL)
    AND (encrypted_withdrawal_reason IS NULL OR status = 'Withdrawn'));
GRANT UPDATE (proposed_name,proposed_reports_to_position_id,encrypted_withdrawal_reason,withdrawal_reason_key_version) ON hcm.position_change_request TO hcm_runtime;
-- Applying a proposed solid line closes the one it replaces the day before; nothing else about a
-- relationship ever changes.
GRANT UPDATE (effective_to) ON hcm.position_relationship TO hcm_runtime;
