-- Ownership: Attendance. Seed reset must not erase real configurations, immutable
-- command evidence or work intent. Use an explicit reviewed recovery instead.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
IF EXISTS(SELECT 1 FROM hcm.work_schedule WHERE tenant_id='local-dunder-mifflin')
 OR EXISTS(SELECT 1 FROM hcm.shift WHERE tenant_id='local-dunder-mifflin')
 OR EXISTS(SELECT 1 FROM hcm.attendance_policy WHERE tenant_id='local-dunder-mifflin')
 OR EXISTS(SELECT 1 FROM hcm.holiday_calendar WHERE tenant_id='local-dunder-mifflin')
 OR EXISTS(SELECT 1 FROM hcm.attendance_command_receipt WHERE tenant_id='local-dunder-mifflin')
 OR EXISTS(SELECT 1 FROM hcm.attendance_outbox WHERE tenant_id='local-dunder-mifflin') THEN
  RAISE EXCEPTION 'Attendance evidence exists; seed reset requires a reviewed recovery';
END IF;
DELETE FROM hcm.work_schedule_seed_day WHERE tenant_id='local-dunder-mifflin' AND default_id='dunder-mifflin/attendance-default/standard-week';
DELETE FROM hcm.work_schedule_seed_default WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/attendance-default/standard-week';
