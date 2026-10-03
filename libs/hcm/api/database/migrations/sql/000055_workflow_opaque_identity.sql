-- Preserve existing Workflow identities while aligning physical storage with
-- TDD-HCM-3-DATA-MODEL: all domain identities are opaque tenant-composite text.
-- This forward correction retains every row, unique key and tenant reference.
DO $$
DECLARE reference record;
DECLARE field record;
BEGIN
  FOR reference IN
    SELECT c.conrelid::regclass AS relation,c.conname
    FROM pg_constraint c
    WHERE c.contype='f' AND c.confrelid IN
      ('hcm.workflow_instance'::regclass,'hcm.workflow_stage_instance'::regclass,'hcm.workflow_task'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',reference.relation,reference.conname);
  END LOOP;
  FOR field IN SELECT * FROM (VALUES
    ('workflow_instance','id'),
    ('workflow_stage_instance','instance_id'),
    ('workflow_task','id'),('workflow_task','instance_id'),
    ('workflow_task_candidate','task_id'),
    ('workflow_task_timer','id'),('workflow_task_timer','task_id'),
    ('workflow_reconciliation_exception','id'),('workflow_reconciliation_exception','task_id'),
    ('workflow_planning_receipt','instance_id')
  ) AS fields(relation,column_name)
  LOOP
    EXECUTE format('ALTER TABLE hcm.%I ALTER COLUMN %I TYPE text USING %I::text',field.relation,field.column_name,field.column_name);
    EXECUTE format('ALTER TABLE hcm.%I ADD CHECK (%I IS NULL OR length(%I) BETWEEN 1 AND 200)',field.relation,field.column_name,field.column_name);
  END LOOP;
END $$;

ALTER TABLE hcm.workflow_stage_instance ADD FOREIGN KEY (tenant_id,instance_id) REFERENCES hcm.workflow_instance(tenant_id,id);
ALTER TABLE hcm.workflow_task ADD FOREIGN KEY (tenant_id,instance_id,stage) REFERENCES hcm.workflow_stage_instance(tenant_id,instance_id,stage);
ALTER TABLE hcm.workflow_task_candidate ADD FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id);
ALTER TABLE hcm.workflow_task_timer ADD FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id);
ALTER TABLE hcm.workflow_reconciliation_exception ADD FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id);
ALTER TABLE hcm.workflow_planning_receipt ADD FOREIGN KEY (tenant_id,instance_id) REFERENCES hcm.workflow_instance(tenant_id,id);
