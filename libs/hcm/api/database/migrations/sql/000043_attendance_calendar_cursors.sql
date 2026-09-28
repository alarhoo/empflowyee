-- Extend Attendance-owned opaque continuation to holiday calendars while retaining
-- real tenant-composite references. Existing schedule insert/handle shapes remain
-- valid: owner columns are derived by SQL from a closed app code, never caller input.
ALTER TABLE hcm.attendance_query_cursor
  DROP CONSTRAINT attendance_query_cursor_app_code_check,
  DROP CONSTRAINT attendance_query_cursor_tenant_id_last_id_fkey;
ALTER TABLE hcm.attendance_query_cursor
  ADD CONSTRAINT attendance_query_cursor_app_code_check
    CHECK (app_code IN ('WORK_SCHEDULE_TEMPLATES','WORK_SCHEDULES','HOLIDAY_CALENDARS')),
  ADD COLUMN work_schedule_id text GENERATED ALWAYS AS
    (CASE WHEN app_code IN ('WORK_SCHEDULE_TEMPLATES','WORK_SCHEDULES') THEN last_id END) STORED,
  ADD COLUMN holiday_calendar_id text GENERATED ALWAYS AS
    (CASE WHEN app_code='HOLIDAY_CALENDARS' THEN last_id END) STORED;
ALTER TABLE hcm.attendance_query_cursor
  ADD CONSTRAINT attendance_cursor_schedule_fk FOREIGN KEY (tenant_id,work_schedule_id)
    REFERENCES hcm.work_schedule(tenant_id,id),
  ADD CONSTRAINT attendance_cursor_holiday_fk FOREIGN KEY (tenant_id,holiday_calendar_id)
    REFERENCES hcm.holiday_calendar(tenant_id,id);
-- Existing RLS, actor reference, no-UPDATE grants and expiry checks remain active.
