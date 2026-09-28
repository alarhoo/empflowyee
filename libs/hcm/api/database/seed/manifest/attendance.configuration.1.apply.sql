-- Ownership: Attendance. DEC-HCM3-003 supplies draft defaults, never a guessed
-- unpaid-break placement or timezone and never a published live configuration.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.work_schedule_seed_default(tenant_id,id,code,name,week_starts_on)
VALUES('local-dunder-mifflin','dunder-mifflin/attendance-default/standard-week','STANDARD_WEEK','Standard work week',1);
INSERT INTO hcm.work_schedule_seed_day(tenant_id,default_id,weekday,kind,start_time,end_time,end_day_offset,unpaid_break_minutes)
SELECT 'local-dunder-mifflin','dunder-mifflin/attendance-default/standard-week',day,'Work','09:00'::time,'18:00'::time,0,60 FROM generate_series(1,5) AS day;
INSERT INTO hcm.work_schedule_seed_day(tenant_id,default_id,weekday,kind,unpaid_break_minutes)
SELECT 'local-dunder-mifflin','dunder-mifflin/attendance-default/standard-week',day,'Rest',0 FROM generate_series(6,7) AS day;
