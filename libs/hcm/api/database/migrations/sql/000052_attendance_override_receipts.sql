-- Override commands reuse Attendance's actor-bound, immutable command receipts.
-- The typed source FK retains owner identity without serializing private reasons.
ALTER TABLE hcm.attendance_command_receipt
  ADD COLUMN schedule_override_id text,
  ADD CONSTRAINT attendance_receipt_override_fk FOREIGN KEY (tenant_id,schedule_override_id)
    REFERENCES hcm.schedule_override(tenant_id,id),
  ADD CONSTRAINT attendance_receipt_one_source CHECK
    (num_nonnulls(work_schedule_version_id,shift_version_id,attendance_policy_version_id,holiday_calendar_version_id,schedule_override_id)<=1),
  ADD CONSTRAINT attendance_receipt_override_revision CHECK
    (schedule_override_id IS NULL OR source_revision IS NOT NULL);
