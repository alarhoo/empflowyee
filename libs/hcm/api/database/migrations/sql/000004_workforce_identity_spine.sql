-- Ownership: workforce-foundation. Minimal approved identity/organisation spine, not HR lifecycle workflows.
CREATE TABLE hcm.organisation (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), id text NOT NULL, code text NOT NULL,
  name text NOT NULL, parent_id text,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,parent_id) REFERENCES hcm.organisation(tenant_id,id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE TABLE hcm.location (
  tenant_id text NOT NULL, id text NOT NULL, organisation_id text NOT NULL,
  name text NOT NULL, city text NOT NULL, country_code text NOT NULL CHECK (length(country_code)=2),
  timezone text NOT NULL,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,organisation_id) REFERENCES hcm.organisation(tenant_id,id)
);
CREATE TABLE hcm.person (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), id text NOT NULL,
  given_name text NOT NULL, family_name text NOT NULL, display_name text NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE hcm.worker (
  tenant_id text NOT NULL, id text NOT NULL, person_id text NOT NULL, worker_code text NOT NULL,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,person_id), UNIQUE (tenant_id,worker_code),
  FOREIGN KEY (tenant_id,person_id) REFERENCES hcm.person(tenant_id,id)
);
CREATE TABLE hcm.employment (
  tenant_id text NOT NULL, id text NOT NULL, worker_id text NOT NULL, organisation_id text NOT NULL,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,organisation_id) REFERENCES hcm.organisation(tenant_id,id)
);
CREATE TABLE hcm.assignment (
  tenant_id text NOT NULL, id text NOT NULL, employment_id text NOT NULL,
  organisation_id text NOT NULL, location_id text NOT NULL, job_title text NOT NULL,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,organisation_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,location_id) REFERENCES hcm.location(tenant_id,id)
);
DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['organisation','location','person','worker','employment','assignment'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;
