-- Extend immutable workday evidence with real typed dated sources. Existing
-- ordinary schedule rows retain their identity, digest and exact stored intervals.
ALTER TABLE hcm.published_workday
  ALTER COLUMN work_schedule_version_id DROP NOT NULL,
  ADD COLUMN shift_version_id text,
  ADD COLUMN shift_roster_entry_id text,
  ADD COLUMN schedule_override_id text,
  ADD CONSTRAINT workday_shift_source FOREIGN KEY (tenant_id,shift_version_id) REFERENCES hcm.shift_version(tenant_id,id),
  ADD CONSTRAINT workday_roster_source FOREIGN KEY (tenant_id,employment_id,work_date,shift_roster_entry_id) REFERENCES hcm.shift_roster_entry(tenant_id,employment_id,work_date,id),
  ADD CONSTRAINT workday_override_source FOREIGN KEY (tenant_id,employment_id,work_date,schedule_override_id) REFERENCES hcm.schedule_override(tenant_id,employment_id,work_date,id),
  ADD CONSTRAINT workday_exact_pattern_source CHECK (
    num_nonnulls(work_schedule_version_id,shift_version_id)=1 AND
    ((schedule_override_id IS NOT NULL AND shift_roster_entry_id IS NULL)
      OR (schedule_override_id IS NULL AND shift_roster_entry_id IS NOT NULL AND shift_version_id IS NOT NULL)
      OR (schedule_override_id IS NULL AND shift_roster_entry_id IS NULL AND work_schedule_version_id IS NOT NULL)));

-- Preserve monthly fences, exact prior revision and immutable source validation
-- while selecting the relevant typed source rather than inventing schedule rows.
CREATE OR REPLACE FUNCTION hcm.guard_published_workday() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE prior_id text;
DECLARE prior_revision integer;
DECLARE period_state text;
BEGIN
  PERFORM hcm.fence_attendance_month(NEW.tenant_id,date_trunc('month',NEW.work_date::timestamp)::date,false);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id||':workday:'||NEW.employment_id||':'||to_char(NEW.work_date,'YYYY-MM-DD'),0));
  SELECT state INTO period_state FROM hcm.attendance_period
    WHERE tenant_id=NEW.tenant_id AND month_start=date_trunc('month',NEW.work_date::timestamp)::date;
  IF period_state IN ('Closing','Locked','Reopened') THEN
    RAISE EXCEPTION 'Period does not allow ordinary workday publication' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.zone) THEN
    RAISE EXCEPTION 'Workday timezone unavailable' USING ERRCODE='23514';
  END IF;
  IF NEW.schedule_override_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM hcm.schedule_override o JOIN hcm.published_workday b ON b.tenant_id=o.tenant_id AND b.id=o.basis_workday_id
      WHERE o.tenant_id=NEW.tenant_id AND o.id=NEW.schedule_override_id AND o.employment_id=NEW.employment_id AND o.work_date=NEW.work_date
      AND o.state='Approved' AND o.zone=NEW.zone AND o.kind=NEW.schedule_kind
      AND b.work_schedule_version_id IS NOT DISTINCT FROM NEW.work_schedule_version_id AND b.shift_version_id IS NOT DISTINCT FROM NEW.shift_version_id) THEN
      RAISE EXCEPTION 'Approved override basis unavailable' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.shift_roster_entry_id IS NOT NULL THEN
    IF NEW.schedule_kind<>'Work' OR NOT EXISTS(SELECT 1 FROM hcm.shift_roster_entry e
      JOIN hcm.shift_roster r ON r.tenant_id=e.tenant_id AND r.id=e.roster_id
      JOIN hcm.shift_version v ON v.tenant_id=e.tenant_id AND v.id=e.shift_version_id
      WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.shift_roster_entry_id AND e.employment_id=NEW.employment_id AND e.work_date=NEW.work_date
      AND r.state='Published' AND v.id=NEW.shift_version_id AND v.state='Published' AND v.effective_period @> NEW.work_date
      AND (v.timezone_mode<>'Fixed' OR v.fixed_zone=NEW.zone)) THEN
      RAISE EXCEPTION 'Published roster basis unavailable' USING ERRCODE='23514';
    END IF;
  ELSE
  IF NOT EXISTS (SELECT 1 FROM hcm.work_schedule_version v
    JOIN hcm.work_schedule s ON s.tenant_id=v.tenant_id AND s.id=v.schedule_id
    JOIN hcm.work_schedule_day d ON d.tenant_id=v.tenant_id AND d.version_id=v.id
    WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.work_schedule_version_id AND v.state='Published'
      AND NOT s.is_template AND v.effective_period @> NEW.work_date
      AND d.weekday=extract(isodow FROM NEW.work_date) AND d.kind=NEW.schedule_kind
      AND (v.timezone_mode<>'Fixed' OR v.fixed_zone=NEW.zone)) THEN
    RAISE EXCEPTION 'Published schedule basis unavailable' USING ERRCODE='23514';
  END IF;
  END IF;
  IF NEW.attendance_policy_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hcm.attendance_policy_version WHERE tenant_id=NEW.tenant_id
      AND id=NEW.attendance_policy_version_id AND state='Published' AND effective_period @> NEW.work_date) THEN
    RAISE EXCEPTION 'Published policy basis unavailable' USING ERRCODE='23514';
  END IF;
  SELECT id,revision INTO prior_id,prior_revision FROM hcm.published_workday
    WHERE tenant_id=NEW.tenant_id AND employment_id=NEW.employment_id AND work_date=NEW.work_date
    ORDER BY revision DESC LIMIT 1;
  IF NEW.revision<>coalesce(prior_revision,0)+1 OR NEW.supersedes_id IS DISTINCT FROM prior_id THEN
    RAISE EXCEPTION 'Exact previous workday revision required' USING ERRCODE='23514';
  END IF;
  NEW.creation_transaction:=pg_current_xact_id();
  RETURN NEW;
END
$body$;
