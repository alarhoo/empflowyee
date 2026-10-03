-- Extend the existing Attendance continuation cache to the Work Schedules app's
-- shift and policy lists. Generated identities retain tenant-composite foreign
-- keys; existing FORCE RLS and hash-only, actor-bound handle grants remain active.
ALTER TABLE hcm.attendance_query_cursor
  DROP CONSTRAINT attendance_query_cursor_app_code_check,
  ADD CONSTRAINT attendance_query_cursor_app_code_check CHECK
    (app_code IN ('WORK_SCHEDULE_TEMPLATES','WORK_SCHEDULES','HOLIDAY_CALENDARS','SHIFTS','ATTENDANCE_POLICIES')),
  ADD COLUMN shift_id text GENERATED ALWAYS AS
    (CASE WHEN app_code='SHIFTS' THEN last_id END) STORED,
  ADD COLUMN attendance_policy_id text GENERATED ALWAYS AS
    (CASE WHEN app_code='ATTENDANCE_POLICIES' THEN last_id END) STORED;
ALTER TABLE hcm.attendance_query_cursor
  ADD CONSTRAINT attendance_cursor_shift_fk FOREIGN KEY (tenant_id,shift_id)
    REFERENCES hcm.shift(tenant_id,id),
  ADD CONSTRAINT attendance_cursor_policy_fk FOREIGN KEY (tenant_id,attendance_policy_id)
    REFERENCES hcm.attendance_policy(tenant_id,id);
