-- Ownership: workforce-foundation. HCM-owned organisation structure (DEC-HCM2-014). The existing
-- organisation table becomes the stable unit identity; effective placement lives in organisation_version.
-- Legacy organisation.parent_id is retained only for the immutable version-1 seed and is not read by HCM-2.
CREATE TABLE hcm.organisation_profile (
  tenant_id text PRIMARY KEY REFERENCES hcm.tenant(id),
  default_time_zone text NOT NULL CHECK (length(default_time_zone) BETWEEN 1 AND 64),
  default_language text NOT NULL CHECK (default_language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  default_currency_code text NOT NULL REFERENCES hcm.currency(code),
  financial_year_start_month smallint NOT NULL CHECK (financial_year_start_month BETWEEN 1 AND 12),
  financial_year_start_day smallint NOT NULL,
  headquarters_location_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  CONSTRAINT organisation_profile_day CHECK (financial_year_start_day BETWEEN 1 AND
    CASE WHEN financial_year_start_month = 2 THEN 28
         WHEN financial_year_start_month IN (4,6,9,11) THEN 30 ELSE 31 END),
  FOREIGN KEY (tenant_id,headquarters_location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.legal_entity (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  registered_name text NOT NULL CHECK (length(btrim(registered_name)) BETWEEN 1 AND 200),
  entity_type text NOT NULL CHECK (entity_type IN ('PrivateLimited','PublicLimited','LimitedLiabilityPartnership','Partnership','SoleProprietorship','Branch','Other')),
  country_code text NOT NULL REFERENCES hcm.country(code),
  registration_number text NOT NULL DEFAULT '' CHECK (length(registration_number) <= 50),
  tax_identification_number text NOT NULL DEFAULT '' CHECK (length(tax_identification_number) <= 50),
  tax_deduction_account_number text NOT NULL DEFAULT '' CHECK (length(tax_deduction_account_number) <= 50),
  social_security_employer_code text NOT NULL DEFAULT '' CHECK (length(social_security_employer_code) <= 50),
  state_insurance_employer_code text NOT NULL DEFAULT '' CHECK (length(state_insurance_employer_code) <= 50),
  registered_location_id text,
  reporting_currency_code text NOT NULL REFERENCES hcm.currency(code),
  financial_year_start_month smallint CHECK (financial_year_start_month BETWEEN 1 AND 12),
  financial_year_start_day smallint,
  incorporated_on date,
  operations_started_on date,
  operations_closed_on date,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  CONSTRAINT legal_entity_financial_year CHECK (
    (financial_year_start_month IS NULL) = (financial_year_start_day IS NULL) AND
    (financial_year_start_day IS NULL OR financial_year_start_day BETWEEN 1 AND
      CASE WHEN financial_year_start_month = 2 THEN 28
           WHEN financial_year_start_month IN (4,6,9,11) THEN 30 ELSE 31 END)),
  CONSTRAINT legal_entity_operations CHECK (operations_closed_on IS NULL OR operations_started_on IS NULL OR operations_closed_on >= operations_started_on),
  CONSTRAINT legal_entity_closed_inactive CHECK (operations_closed_on IS NULL OR NOT is_active),
  FOREIGN KEY (tenant_id,registered_location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.organisation_unit_type (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  plural_name text NOT NULL CHECK (length(btrim(plural_name)) BETWEEN 1 AND 100),
  parent_type_id text,
  hierarchy_level integer NOT NULL CHECK (hierarchy_level BETWEEN 1 AND 20),
  is_enabled boolean NOT NULL DEFAULT true,
  allow_multiple_per_parent boolean NOT NULL DEFAULT true,
  is_legal_entity_bearing boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  CHECK (parent_type_id IS NULL OR parent_type_id <> id),
  CHECK ((parent_type_id IS NULL) = (hierarchy_level = 1)),
  FOREIGN KEY (tenant_id,parent_type_id) REFERENCES hcm.organisation_unit_type(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

ALTER TABLE hcm.organisation
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN superseded_by_id text,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_account_id text,
  ADD COLUMN updated_by_account_id text,
  ADD CONSTRAINT organisation_superseded FOREIGN KEY (tenant_id,superseded_by_id) REFERENCES hcm.organisation(tenant_id,id),
  ADD CONSTRAINT organisation_superseded_self CHECK (superseded_by_id IS NULL OR superseded_by_id <> id),
  ADD CONSTRAINT organisation_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  ADD CONSTRAINT organisation_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);

CREATE TABLE hcm.organisation_version (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  organisation_id text NOT NULL,
  unit_type_id text NOT NULL,
  parent_organisation_id text,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  legal_entity_id text,
  primary_location_id text,
  cost_center_code text NOT NULL DEFAULT '' CHECK (length(cost_center_code) <= 40),
  head_worker_id text,
  sort_order integer NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (
    daterange(effective_from, CASE WHEN effective_to IS NULL THEN NULL ELSE effective_to + 1 END, '[)')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (parent_organisation_id IS NULL OR parent_organisation_id <> organisation_id),
  FOREIGN KEY (tenant_id,organisation_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,unit_type_id) REFERENCES hcm.organisation_unit_type(tenant_id,id),
  FOREIGN KEY (tenant_id,parent_organisation_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  FOREIGN KEY (tenant_id,primary_location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,head_worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CONSTRAINT organisation_version_no_overlap EXCLUDE USING gist (tenant_id WITH =, organisation_id WITH =, effective_period WITH &&)
);
CREATE INDEX organisation_version_parent ON hcm.organisation_version (tenant_id, parent_organisation_id, effective_from);
CREATE INDEX organisation_version_unit ON hcm.organisation_version (tenant_id, organisation_id, effective_from);

CREATE TABLE hcm.department (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  parent_department_id text,
  head_worker_id text,
  cost_center_code text NOT NULL DEFAULT '' CHECK (length(cost_center_code) <= 40),
  target_headcount integer CHECK (target_headcount BETWEEN 0 AND 1000000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  CHECK (parent_department_id IS NULL OR parent_department_id <> id),
  FOREIGN KEY (tenant_id,parent_department_id) REFERENCES hcm.department(tenant_id,id),
  FOREIGN KEY (tenant_id,head_worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.designation (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  parent_designation_id text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  CHECK (parent_designation_id IS NULL OR parent_designation_id <> id),
  FOREIGN KEY (tenant_id,parent_designation_id) REFERENCES hcm.designation(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- Existing locations keep their identity, owning unit, city, country and time zone.
ALTER TABLE hcm.location
  ADD COLUMN code text CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  ADD COLUMN location_type text CHECK (location_type IN ('HeadOffice','BranchOffice','RegisteredOffice','Factory','Warehouse','ClientSite','Remote')),
  ADD COLUMN address_line1 text NOT NULL DEFAULT '' CHECK (length(address_line1) <= 200),
  ADD COLUMN address_line2 text NOT NULL DEFAULT '' CHECK (length(address_line2) <= 200),
  ADD COLUMN locality text NOT NULL DEFAULT '' CHECK (length(locality) <= 100),
  ADD COLUMN state_or_province text NOT NULL DEFAULT '' CHECK (length(state_or_province) <= 100),
  ADD COLUMN postal_code text NOT NULL DEFAULT '' CHECK (length(postal_code) <= 20),
  ADD COLUMN latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN geofence_radius_meters integer CHECK (geofence_radius_meters BETWEEN 1 AND 100000),
  ADD COLUMN contact_phone text NOT NULL DEFAULT '' CHECK (length(contact_phone) <= 40),
  ADD COLUMN contact_email text NOT NULL DEFAULT '' CHECK (length(contact_email) <= 254),
  ADD COLUMN is_virtual boolean NOT NULL DEFAULT false,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_account_id text,
  ADD COLUMN updated_by_account_id text,
  ADD CONSTRAINT location_coordinates CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT location_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  ADD CONSTRAINT location_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);
CREATE UNIQUE INDEX location_code ON hcm.location (tenant_id, code) WHERE code IS NOT NULL;
ALTER TABLE hcm.organisation_profile ADD CONSTRAINT organisation_profile_timezone CHECK (default_time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$');

CREATE TABLE hcm.workforce_command_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  actor_account_id text NOT NULL,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object' AND octet_length(response::text) <= 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,actor_account_id,operation,idempotency_key),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['organisation_profile','legal_entity','organisation_unit_type','organisation_version','department','designation','workforce_command_receipt'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;
-- Runtime may change only mutable columns; codes, identities and tenant ownership stay fixed.
GRANT UPDATE (default_time_zone,default_language,default_currency_code,financial_year_start_month,financial_year_start_day,headquarters_location_id,revision,updated_at,updated_by_account_id) ON hcm.organisation_profile TO hcm_runtime;
GRANT UPDATE (name,registered_name,entity_type,country_code,registration_number,tax_identification_number,tax_deduction_account_number,social_security_employer_code,state_insurance_employer_code,registered_location_id,reporting_currency_code,financial_year_start_month,financial_year_start_day,incorporated_on,operations_started_on,operations_closed_on,is_active,revision,updated_at,updated_by_account_id) ON hcm.legal_entity TO hcm_runtime;
GRANT UPDATE (name,plural_name,is_enabled,allow_multiple_per_parent,sort_order,revision,updated_at,updated_by_account_id) ON hcm.organisation_unit_type TO hcm_runtime;
GRANT INSERT (tenant_id,id,code,name,is_active,created_by_account_id,updated_by_account_id) ON hcm.organisation TO hcm_runtime;
GRANT UPDATE (name,is_active,superseded_by_id,revision,updated_at,updated_by_account_id) ON hcm.organisation TO hcm_runtime;
GRANT UPDATE (effective_to) ON hcm.organisation_version TO hcm_runtime;
GRANT UPDATE (name,description,parent_department_id,head_worker_id,cost_center_code,target_headcount,is_active,sort_order,revision,updated_at,updated_by_account_id) ON hcm.department TO hcm_runtime;
GRANT UPDATE (name,description,parent_designation_id,sort_order,is_active,revision,updated_at,updated_by_account_id) ON hcm.designation TO hcm_runtime;
GRANT INSERT (tenant_id,id,organisation_id,name,city,country_code,timezone,code,location_type,address_line1,address_line2,locality,state_or_province,postal_code,latitude,longitude,geofence_radius_meters,contact_phone,contact_email,is_virtual,is_active,created_by_account_id,updated_by_account_id) ON hcm.location TO hcm_runtime;
GRANT UPDATE (organisation_id,name,city,country_code,timezone,location_type,address_line1,address_line2,locality,state_or_province,postal_code,latitude,longitude,geofence_radius_meters,contact_phone,contact_email,is_virtual,is_active,revision,updated_at,updated_by_account_id) ON hcm.location TO hcm_runtime;
