-- Notifications owns the bounded in-app event configuration; no external channel is introduced.
CREATE TABLE hcm.notification_template (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id),
 event_type text NOT NULL CHECK(event_type IN ('document.requested','document.submitted','document.replacement-requested')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,event_type),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.notification_rule (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id),
 event_type text NOT NULL CHECK(event_type IN ('document.requested','document.submitted','document.replacement-requested')),
 enabled boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,event_type),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES hcm.user_account(tenant_id,id)
);
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['notification_template','notification_rule'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime',relation);
 END LOOP;
END
$policies$;
-- Registered rows are provisioned explicitly; business runtime can only edit bounded configuration.
GRANT UPDATE(title,body,revision,updated_by,updated_at) ON hcm.notification_template TO hcm_runtime;
GRANT UPDATE(enabled,revision,updated_by,updated_at) ON hcm.notification_rule TO hcm_runtime;
