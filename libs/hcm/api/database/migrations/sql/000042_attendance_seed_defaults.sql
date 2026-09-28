-- Attendance's incomplete seed proposal is distinct from a complete schedule.
-- It has no timezone, date, publication state or live-assignment foreign key.
CREATE TABLE hcm.work_schedule_seed_default (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  name text NOT NULL CHECK (length(name)<=120 AND length(btrim(name))>0),
  week_starts_on smallint NOT NULL CHECK (week_starts_on BETWEEN 1 AND 7),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id)
);
CREATE TABLE hcm.work_schedule_seed_day (
  tenant_id text NOT NULL,
  default_id text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  kind text NOT NULL CHECK (kind IN ('Work','Rest')),
  start_time time(3),
  end_time time(3),
  end_day_offset smallint CHECK (end_day_offset IN (0,1)),
  unpaid_break_minutes smallint NOT NULL CHECK (unpaid_break_minutes>=0),
  PRIMARY KEY (tenant_id,default_id,weekday),
  FOREIGN KEY (tenant_id,default_id) REFERENCES hcm.work_schedule_seed_default(tenant_id,id),
  CHECK ((kind='Rest' AND start_time IS NULL AND end_time IS NULL AND end_day_offset IS NULL AND unpaid_break_minutes=0)
    OR (kind='Work' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_day_offset IS NOT NULL
      AND extract(epoch FROM (end_time-start_time))+end_day_offset*86400>unpaid_break_minutes*60
      AND start_time<'24:00'::time AND end_time<'24:00'::time))
);
DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['work_schedule_seed_default','work_schedule_seed_day'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
