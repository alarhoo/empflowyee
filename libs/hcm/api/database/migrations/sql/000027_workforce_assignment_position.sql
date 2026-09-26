-- Workforce assignments may occupy a position. The link is set when an assignment row is created
-- and never rewritten: a move to another position supersedes the assignment. Occupancy is derived
-- from effective assignments, so a position never stores a person (job architecture rule 14).
ALTER TABLE hcm.assignment ADD COLUMN position_id text;
ALTER TABLE hcm.assignment
  ADD CONSTRAINT assignment_position FOREIGN KEY (tenant_id,position_id) REFERENCES hcm.position(tenant_id,id);
CREATE INDEX assignment_position_period ON hcm.assignment USING gist (tenant_id, position_id, effective_period)
  WHERE position_id IS NOT NULL;
GRANT INSERT (position_id) ON hcm.assignment TO hcm_runtime;
