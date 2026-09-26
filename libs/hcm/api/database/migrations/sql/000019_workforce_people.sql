-- Ownership: workforce-foundation. HCM-2 people: tenant lookups, person and worker evolution, and
-- person addresses, contact points and relationships. Version-1 seed rows and positional test
-- inserts stay valid: every new person and worker column is appended, nullable or defaulted.

CREATE TABLE hcm.worker_type (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  statutory_class text NOT NULL CHECK (statutory_class IN ('Employee','Contractor','Apprentice','Intern','Consultant')),
  is_payroll_eligible boolean NOT NULL,
  is_benefit_eligible boolean NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.employment_end_reason (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  is_voluntary boolean NOT NULL,
  is_regrettable boolean NOT NULL DEFAULT false,
  is_eligible_for_rehire_by_default boolean NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.worker_event_type (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  category text NOT NULL CHECK (category IN ('Hire','Confirm','Promote','Transfer','Demote','CompensationChange','Leave','Suspend','Exit','Rehire','Other')),
  requires_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- Person keeps given_name, family_name and display_name with their meaning; new facts are optional.
ALTER TABLE hcm.person
  ADD COLUMN middle_name text NOT NULL DEFAULT '' CHECK (length(middle_name) <= 100),
  ADD COLUMN preferred_name text NOT NULL DEFAULT '' CHECK (length(preferred_name) <= 100),
  ADD COLUMN former_name text NOT NULL DEFAULT '' CHECK (length(former_name) <= 150),
  ADD COLUMN birth_date date,
  ADD COLUMN gender_code text REFERENCES hcm.gender(code),
  ADD COLUMN marital_status_code text REFERENCES hcm.marital_status(code),
  ADD COLUMN nationality_country_code text REFERENCES hcm.country(code),
  ADD COLUMN blood_group text CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  ADD COLUMN deceased_on date,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN merged_into_person_id text,
  ADD COLUMN search_text text NOT NULL DEFAULT '' CHECK (length(search_text) <= 400),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_account_id text,
  ADD COLUMN updated_by_account_id text,
  ADD CONSTRAINT person_merge_target FOREIGN KEY (tenant_id,merged_into_person_id) REFERENCES hcm.person(tenant_id,id),
  ADD CONSTRAINT person_merge_self CHECK (merged_into_person_id IS NULL OR merged_into_person_id <> id),
  ADD CONSTRAINT person_merged_inactive CHECK (merged_into_person_id IS NULL OR NOT is_active),
  ADD CONSTRAINT person_deceased_after_birth CHECK (deceased_on IS NULL OR birth_date IS NULL OR deceased_on >= birth_date),
  ADD CONSTRAINT person_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  ADD CONSTRAINT person_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);
-- search_text holds only normalized names, never identifiers; the trigram index serves contains-search.
CREATE INDEX person_search ON hcm.person USING gist (tenant_id, search_text hcm.gist_trgm_ops);
CREATE INDEX person_name_order ON hcm.person (tenant_id, lower(family_name), lower(given_name), id);

ALTER TABLE hcm.worker
  ADD COLUMN worker_type_id text,
  ADD COLUMN first_engagement_start_date date,
  ADD COLUMN latest_engagement_end_date date,
  ADD COLUMN is_currently_engaged boolean NOT NULL DEFAULT false,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_account_id text,
  ADD COLUMN updated_by_account_id text,
  ADD CONSTRAINT worker_type_reference FOREIGN KEY (tenant_id,worker_type_id) REFERENCES hcm.worker_type(tenant_id,id),
  ADD CONSTRAINT worker_engagement_order CHECK (latest_engagement_end_date IS NULL OR first_engagement_start_date IS NULL OR latest_engagement_end_date >= first_engagement_start_date),
  ADD CONSTRAINT worker_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  ADD CONSTRAINT worker_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);
CREATE INDEX worker_code_search ON hcm.worker (tenant_id, lower(worker_code) text_pattern_ops);

CREATE TABLE hcm.person_address (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  person_id text NOT NULL,
  address_type text NOT NULL CHECK (address_type IN ('Permanent','Current','Correspondence','Emergency')),
  address_line1 text NOT NULL DEFAULT '' CHECK (length(address_line1) <= 200),
  address_line2 text NOT NULL DEFAULT '' CHECK (length(address_line2) <= 200),
  locality text NOT NULL DEFAULT '' CHECK (length(locality) <= 100),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 1 AND 100),
  state_or_province text NOT NULL DEFAULT '' CHECK (length(state_or_province) <= 100),
  postal_code text NOT NULL DEFAULT '' CHECK (length(postal_code) <= 20),
  country_code text NOT NULL REFERENCES hcm.country(code),
  is_primary boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT person_address_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT person_address_one_primary EXCLUDE USING gist (tenant_id WITH =, person_id WITH =, effective_period WITH &&) WHERE (is_primary),
  FOREIGN KEY (tenant_id,person_id) REFERENCES hcm.person(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX person_address_person ON hcm.person_address USING gist (tenant_id, person_id, effective_period);

-- Contact points stay unverified until a verification channel exists (carry-forward).
CREATE TABLE hcm.person_contact_point (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  person_id text NOT NULL,
  contact_point_type text NOT NULL CHECK (contact_point_type IN ('PersonalEmail','MobilePhone','HomePhone','EmergencyPhone')),
  value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 254),
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT person_contact_point_verification CHECK (is_verified = (verified_at IS NOT NULL)),
  CONSTRAINT person_contact_point_email CHECK (contact_point_type <> 'PersonalEmail' OR value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  FOREIGN KEY (tenant_id,person_id) REFERENCES hcm.person(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX person_contact_point_one_primary ON hcm.person_contact_point (tenant_id, person_id, contact_point_type) WHERE is_primary AND is_active;

-- Statutory nominee columns exist for later statutory work; no HCM-2 runtime grant can write them.
CREATE TABLE hcm.person_relationship (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  person_id text NOT NULL,
  relationship_type_code text NOT NULL REFERENCES hcm.relationship_type(code),
  related_person_id text,
  full_name text NOT NULL DEFAULT '' CHECK (length(full_name) <= 150),
  birth_date date,
  gender_code text REFERENCES hcm.gender(code),
  contact_number text NOT NULL DEFAULT '' CHECK (length(contact_number) <= 40),
  is_dependent boolean NOT NULL DEFAULT false,
  is_emergency_contact boolean NOT NULL DEFAULT false,
  emergency_contact_priority smallint CHECK (emergency_contact_priority BETWEEN 1 AND 99),
  is_statutory_nominee boolean NOT NULL DEFAULT false,
  nomination_share_percentage numeric(5,2) CHECK (nomination_share_percentage > 0 AND nomination_share_percentage <= 100),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT person_relationship_named CHECK (related_person_id IS NOT NULL OR length(btrim(full_name)) > 0),
  CONSTRAINT person_relationship_self CHECK (related_person_id IS NULL OR related_person_id <> person_id),
  CONSTRAINT person_relationship_emergency CHECK (is_emergency_contact = (emergency_contact_priority IS NOT NULL)),
  CONSTRAINT person_relationship_nominee CHECK (is_statutory_nominee = (nomination_share_percentage IS NOT NULL)),
  FOREIGN KEY (tenant_id,person_id) REFERENCES hcm.person(tenant_id,id),
  FOREIGN KEY (tenant_id,related_person_id) REFERENCES hcm.person(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX person_relationship_emergency_priority ON hcm.person_relationship (tenant_id, person_id, emergency_contact_priority) WHERE is_emergency_contact AND is_active;

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['worker_type','employment_end_reason','worker_event_type','person_address','person_contact_point','person_relationship'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Runtime writes only through column-scoped grants; identities, codes and tenant ownership stay fixed.
GRANT INSERT ON hcm.worker_type, hcm.employment_end_reason, hcm.worker_event_type TO hcm_runtime;
GRANT UPDATE (name,description,is_payroll_eligible,is_benefit_eligible,is_active,sort_order,revision,updated_at,updated_by_account_id) ON hcm.worker_type TO hcm_runtime;
GRANT UPDATE (name,description,is_voluntary,is_regrettable,is_eligible_for_rehire_by_default,is_active,sort_order,revision,updated_at,updated_by_account_id) ON hcm.employment_end_reason TO hcm_runtime;
GRANT UPDATE (name,description,requires_approval,is_active,sort_order,revision,updated_at,updated_by_account_id) ON hcm.worker_event_type TO hcm_runtime;
GRANT INSERT (tenant_id,id,given_name,family_name,display_name,middle_name,preferred_name,former_name,birth_date,gender_code,marital_status_code,nationality_country_code,search_text,created_by_account_id,updated_by_account_id) ON hcm.person TO hcm_runtime;
GRANT UPDATE (given_name,family_name,display_name,middle_name,preferred_name,former_name,birth_date,gender_code,marital_status_code,nationality_country_code,deceased_on,is_active,merged_into_person_id,search_text,revision,updated_at,updated_by_account_id) ON hcm.person TO hcm_runtime;
GRANT INSERT (tenant_id,id,person_id,worker_code,worker_type_id,created_by_account_id,updated_by_account_id) ON hcm.worker TO hcm_runtime;
GRANT UPDATE (worker_type_id,first_engagement_start_date,latest_engagement_end_date,is_currently_engaged,revision,updated_at,updated_by_account_id) ON hcm.worker TO hcm_runtime;
GRANT INSERT ON hcm.person_address TO hcm_runtime;
GRANT UPDATE (effective_to,revision,updated_at,updated_by_account_id) ON hcm.person_address TO hcm_runtime;
GRANT INSERT (tenant_id,id,person_id,contact_point_type,value,is_primary,is_active,created_by_account_id,updated_by_account_id) ON hcm.person_contact_point TO hcm_runtime;
GRANT UPDATE (value,is_primary,is_active,revision,updated_at,updated_by_account_id) ON hcm.person_contact_point TO hcm_runtime;
GRANT INSERT (tenant_id,id,person_id,relationship_type_code,related_person_id,full_name,birth_date,gender_code,contact_number,is_dependent,is_emergency_contact,emergency_contact_priority,is_active,created_by_account_id,updated_by_account_id) ON hcm.person_relationship TO hcm_runtime;
GRANT UPDATE (relationship_type_code,full_name,birth_date,gender_code,contact_number,is_dependent,is_emergency_contact,emergency_contact_priority,is_active,revision,updated_at,updated_by_account_id) ON hcm.person_relationship TO hcm_runtime;
