-- Ownership: access-control. Manual review snapshots preserve historical grant/role identities.
CREATE TABLE hcm.access_review (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Closed')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK ((status='Open' AND closed_at IS NULL) OR (status='Closed' AND closed_at IS NOT NULL))
);
CREATE TABLE hcm.access_review_item (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  review_id text NOT NULL,
  account_id text NOT NULL,
  role_id text NOT NULL CHECK (length(role_id) BETWEEN 1 AND 64),
  grant_id text NOT NULL CHECK (length(grant_id) BETWEEN 1 AND 200),
  role_revision integer NOT NULL CHECK (role_revision > 0),
  account_revision integer NOT NULL CHECK (account_revision > 0),
  account_label text NOT NULL CHECK (length(account_label) BETWEEN 1 AND 500),
  role_label text NOT NULL CHECK (length(role_label) BETWEEN 1 AND 100),
  decision text NOT NULL DEFAULT 'Pending' CHECK (decision IN ('Pending','Retain','Revoke','Removed')),
  decision_reason text,
  decided_by_account_id text,
  decided_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,review_id,grant_id),
  FOREIGN KEY (tenant_id,review_id) REFERENCES hcm.access_review(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,decided_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 1 AND 500),
  CHECK ((decision='Pending' AND decision_reason IS NULL AND decided_at IS NULL AND decided_by_account_id IS NULL)
    OR (decision<>'Pending' AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND decided_by_account_id IS NOT NULL))
);
-- No live grant or role FK: revoked/deleted assignments remain historical review evidence.
CREATE INDEX access_review_time ON hcm.access_review(tenant_id,created_at,id);
CREATE INDEX access_review_item_page ON hcm.access_review_item(tenant_id,review_id,id);
DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['access_review','access_review_item'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
-- Runtime cannot remove evidence, rewrite ownership, or alter the initial review attribution.
GRANT UPDATE(status,revision,closed_at) ON hcm.access_review TO hcm_runtime;
GRANT UPDATE(grant_id,role_revision,account_revision,account_label,role_label,decision,decision_reason,decided_by_account_id,decided_at,revision)
  ON hcm.access_review_item TO hcm_runtime;
