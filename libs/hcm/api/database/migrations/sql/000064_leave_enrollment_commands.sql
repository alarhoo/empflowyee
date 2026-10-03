-- Enrollment commands retain a typed tenant/policy enrollment reference alongside
-- their actor-bound response and encrypted reason. Existing policy receipts remain valid.
ALTER TABLE hcm.leave_enrollment ADD CONSTRAINT leave_enrollment_policy_identity
  UNIQUE(tenant_id,id,policy_version_id);
ALTER TABLE hcm.leave_command_receipt
  DROP CONSTRAINT leave_command_receipt_operation_check,
  ADD COLUMN enrollment_id text,
  ADD CONSTRAINT leave_command_operation CHECK(operation IN ('Policy.create','Policy.update','Policy.version','Enrollment.create')),
  ADD CONSTRAINT leave_command_enrollment_reference FOREIGN KEY(tenant_id,enrollment_id,policy_version_id)
    REFERENCES hcm.leave_enrollment(tenant_id,id,policy_version_id),
  ADD CONSTRAINT leave_command_enrollment_shape CHECK(
    (operation='Enrollment.create' AND enrollment_id IS NOT NULL AND encrypted_reason IS NOT NULL)
    OR (operation<>'Enrollment.create' AND enrollment_id IS NULL));
