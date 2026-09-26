-- Ownership: employee. Profile field policy (TDD-HCM-2-DATA-MODEL migration order 5).
-- Visibility audiences are cumulative, narrowest first: Self < Hr < Manager < Organization.
-- A field visible at Manager is also visible to Hr and Self; Organization reaches every
-- directory viewer. Edit modes are ordered NotEditable < ServiceRequest < Direct.
-- Tenants and workers may only narrow the product ceiling; triggers enforce it.

CREATE TABLE hcm.profile_field_definition (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9-]{1,59}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  section_code text NOT NULL CHECK (section_code IN ('Identity','Personal','Contact','Employment','Assignment','Other')),
  source_entity text NOT NULL CHECK (source_entity IN ('person','worker','employment','assignment','person_contact_point','person_address','person_relationship','reporting_line')),
  source_attribute text NOT NULL CHECK (length(source_attribute) BETWEEN 1 AND 100),
  sensitivity text NOT NULL CHECK (sensitivity IN ('DirectorySafe','Personal','Sensitive','Restricted')),
  maximum_visibility text NOT NULL CHECK (maximum_visibility IN ('Self','Hr','Manager','Organization')),
  required_entitlement_code text NOT NULL DEFAULT 'hcm.employee' CHECK (length(required_entitlement_code) BETWEEN 1 AND 100),
  is_searchable_when_visible boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 9999),
  -- Personal data never reaches the directory; Sensitive and Restricted stay within HR.
  CONSTRAINT profile_field_definition_sensitivity_ceiling CHECK (
    array_position(ARRAY['Self','Hr','Manager','Organization'], maximum_visibility)
    <= CASE sensitivity WHEN 'DirectorySafe' THEN 4 WHEN 'Personal' THEN 3 ELSE 2 END),
  CONSTRAINT profile_field_definition_search CHECK (
    NOT is_searchable_when_visible OR (sensitivity = 'DirectorySafe' AND maximum_visibility = 'Organization'))
);

CREATE TABLE hcm.profile_field_default_policy (
  field_code text NOT NULL REFERENCES hcm.profile_field_definition(code),
  requiredness_context text NOT NULL CHECK (requiredness_context IN ('WorkforceActivation')),
  requiredness text NOT NULL CHECK (requiredness IN ('Optional','Recommended','Required','Hidden')),
  visibility text NOT NULL CHECK (visibility IN ('Self','Hr','Manager','Organization')),
  self_edit_mode text NOT NULL CHECK (self_edit_mode IN ('Direct','ServiceRequest','NotEditable')),
  requires_verification boolean NOT NULL DEFAULT false,
  allow_worker_visibility_preference boolean NOT NULL DEFAULT false,
  PRIMARY KEY (field_code, requiredness_context)
);

CREATE TABLE hcm.custom_field_definition (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  owner_scope text NOT NULL CHECK (owner_scope IN ('Person','Worker','Employment','Assignment')),
  data_type text NOT NULL CHECK (data_type IN ('Text','LongText','Integer','Decimal','Date','Boolean','SingleSelect','MultiSelect')),
  sensitivity text NOT NULL CHECK (sensitivity IN ('DirectorySafe','Personal','Sensitive','Restricted')),
  section_code text NOT NULL CHECK (section_code IN ('Identity','Personal','Contact','Employment','Assignment','Other')),
  is_searchable_when_visible boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  -- A custom field's ceiling derives from its sensitivity; only DirectorySafe fields are searchable.
  CONSTRAINT custom_field_definition_search CHECK (NOT is_searchable_when_visible OR sensitivity = 'DirectorySafe'),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.custom_field_option (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  custom_field_id text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,custom_field_id,code),
  FOREIGN KEY (tenant_id,custom_field_id) REFERENCES hcm.custom_field_definition(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.profile_field_tenant_policy (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  standard_field_code text REFERENCES hcm.profile_field_definition(code),
  custom_field_id text,
  requiredness_context text NOT NULL CHECK (requiredness_context IN ('WorkforceActivation')),
  requiredness text NOT NULL CHECK (requiredness IN ('Optional','Recommended','Required','Hidden')),
  visibility text NOT NULL CHECK (visibility IN ('Self','Hr','Manager','Organization')),
  self_edit_mode text NOT NULL CHECK (self_edit_mode IN ('Direct','ServiceRequest','NotEditable')),
  -- No verification channel exists in HCM-2.
  requires_verification boolean NOT NULL DEFAULT false CHECK (NOT requires_verification),
  allow_worker_visibility_preference boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  effective_from_at timestamptz NOT NULL DEFAULT now(),
  effective_until_at timestamptz,
  superseded_by_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT profile_field_tenant_policy_one_field CHECK (num_nonnulls(standard_field_code, custom_field_id) = 1),
  CONSTRAINT profile_field_tenant_policy_period CHECK (effective_until_at IS NULL OR effective_until_at >= effective_from_at),
  FOREIGN KEY (tenant_id,custom_field_id) REFERENCES hcm.custom_field_definition(tenant_id,id),
  FOREIGN KEY (tenant_id,superseded_by_id) REFERENCES hcm.profile_field_tenant_policy(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX profile_field_tenant_policy_current ON hcm.profile_field_tenant_policy
  (tenant_id, coalesce(standard_field_code, 'custom:' || custom_field_id), requiredness_context)
  WHERE effective_until_at IS NULL;

CREATE TABLE hcm.profile_visibility_preference (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  worker_id text NOT NULL,
  standard_field_code text REFERENCES hcm.profile_field_definition(code),
  custom_field_id text,
  visibility text NOT NULL CHECK (visibility IN ('Self','Hr','Manager','Organization')),
  effective_from_at timestamptz NOT NULL DEFAULT now(),
  effective_until_at timestamptz,
  superseded_by_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT profile_visibility_preference_one_field CHECK (num_nonnulls(standard_field_code, custom_field_id) = 1),
  CONSTRAINT profile_visibility_preference_period CHECK (effective_until_at IS NULL OR effective_until_at >= effective_from_at),
  FOREIGN KEY (tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,custom_field_id) REFERENCES hcm.custom_field_definition(tenant_id,id),
  FOREIGN KEY (tenant_id,superseded_by_id) REFERENCES hcm.profile_visibility_preference(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX profile_visibility_preference_current ON hcm.profile_visibility_preference
  (tenant_id, worker_id, coalesce(standard_field_code, 'custom:' || custom_field_id))
  WHERE effective_until_at IS NULL;

CREATE TABLE hcm.custom_field_value (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  custom_field_id text NOT NULL,
  person_id text,
  worker_id text,
  employment_id text,
  assignment_id text,
  text_value text CHECK (length(text_value) <= 4000),
  -- Sensitive and Restricted values: ciphertext and key version under ADR-HCM-FIELD-ENCRYPTION.
  encrypted_value bytea,
  encryption_key_version text CHECK (length(encryption_key_version) BETWEEN 1 AND 100),
  masked_text_value text CHECK (length(masked_text_value) <= 100),
  integer_value bigint,
  decimal_value numeric(20,6),
  date_value date,
  boolean_value boolean,
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  superseded_by_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT custom_field_value_one_owner CHECK (num_nonnulls(person_id, worker_id, employment_id, assignment_id) = 1),
  CONSTRAINT custom_field_value_one_value CHECK (num_nonnulls(text_value, encrypted_value, integer_value, decimal_value, date_value, boolean_value) <= 1),
  CONSTRAINT custom_field_value_cipher CHECK ((encrypted_value IS NULL) = (encryption_key_version IS NULL)),
  CONSTRAINT custom_field_value_period CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT custom_field_value_no_overlap EXCLUDE USING gist (
    tenant_id WITH =, custom_field_id WITH =,
    (coalesce(person_id, worker_id, employment_id, assignment_id)) WITH =,
    effective_period WITH &&),
  FOREIGN KEY (tenant_id,custom_field_id) REFERENCES hcm.custom_field_definition(tenant_id,id),
  FOREIGN KEY (tenant_id,person_id) REFERENCES hcm.person(tenant_id,id),
  FOREIGN KEY (tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,superseded_by_id) REFERENCES hcm.custom_field_value(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.custom_field_value_option (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  value_id text NOT NULL,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,value_id,option_id),
  FOREIGN KEY (tenant_id,value_id) REFERENCES hcm.custom_field_value(tenant_id,id),
  FOREIGN KEY (tenant_id,option_id) REFERENCES hcm.custom_field_option(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.employee_command_receipt (
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

-- Product defaults stay within the product ceiling.
CREATE FUNCTION hcm.require_profile_default_within_ceiling() RETURNS trigger LANGUAGE plpgsql AS $default$
DECLARE ceiling text;
BEGIN
  SELECT maximum_visibility INTO ceiling FROM hcm.profile_field_definition WHERE code = NEW.field_code;
  IF ceiling IS NULL THEN
    RAISE EXCEPTION 'Profile field is unknown' USING ERRCODE = '23503';
  END IF;
  IF array_position(ARRAY['Self','Hr','Manager','Organization'], NEW.visibility)
     > array_position(ARRAY['Self','Hr','Manager','Organization'], ceiling) THEN
    RAISE EXCEPTION 'Profile default exceeds the product ceiling' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$default$;
CREATE TRIGGER profile_default_within_ceiling BEFORE INSERT OR UPDATE ON hcm.profile_field_default_policy
  FOR EACH ROW EXECUTE FUNCTION hcm.require_profile_default_within_ceiling();

-- Tenant policy may only narrow: visibility within the ceiling, edit mode within the product
-- default, worker preferences only where the product allows them, product-required fields stay required.
CREATE FUNCTION hcm.require_profile_tenant_policy_narrowing() RETURNS trigger LANGUAGE plpgsql AS $narrow$
DECLARE
  ceiling text;
  product record;
BEGIN
  IF NEW.standard_field_code IS NOT NULL THEN
    SELECT maximum_visibility INTO ceiling FROM hcm.profile_field_definition WHERE code = NEW.standard_field_code;
    SELECT * INTO product FROM hcm.profile_field_default_policy
      WHERE field_code = NEW.standard_field_code AND requiredness_context = NEW.requiredness_context;
    IF product.field_code IS NOT NULL AND (
         array_position(ARRAY['NotEditable','ServiceRequest','Direct'], NEW.self_edit_mode)
           > array_position(ARRAY['NotEditable','ServiceRequest','Direct'], product.self_edit_mode)
         OR (NEW.allow_worker_visibility_preference AND NOT product.allow_worker_visibility_preference)
         OR (product.requiredness = 'Required' AND NEW.requiredness <> 'Required')) THEN
      RAISE EXCEPTION 'Tenant profile policy widens the product default' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT CASE sensitivity WHEN 'DirectorySafe' THEN 'Organization' WHEN 'Personal' THEN 'Manager' ELSE 'Hr' END
      INTO ceiling FROM hcm.custom_field_definition
      WHERE tenant_id = NEW.tenant_id AND id = NEW.custom_field_id;
  END IF;
  IF ceiling IS NULL THEN
    RAISE EXCEPTION 'Profile field is unknown' USING ERRCODE = '23503';
  END IF;
  IF array_position(ARRAY['Self','Hr','Manager','Organization'], NEW.visibility)
     > array_position(ARRAY['Self','Hr','Manager','Organization'], ceiling) THEN
    RAISE EXCEPTION 'Tenant profile policy exceeds the visibility ceiling' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$narrow$;
CREATE TRIGGER profile_tenant_policy_narrowing BEFORE INSERT OR UPDATE ON hcm.profile_field_tenant_policy
  FOR EACH ROW EXECUTE FUNCTION hcm.require_profile_tenant_policy_narrowing();

-- A worker preference exists only where the effective policy allows one, and never exceeds the ceiling.
CREATE FUNCTION hcm.require_profile_preference_allowed() RETURNS trigger LANGUAGE plpgsql AS $preference$
DECLARE
  ceiling text;
  allowed boolean;
BEGIN
  IF NEW.standard_field_code IS NOT NULL THEN
    SELECT maximum_visibility INTO ceiling FROM hcm.profile_field_definition WHERE code = NEW.standard_field_code;
    SELECT coalesce(
      (SELECT allow_worker_visibility_preference FROM hcm.profile_field_tenant_policy
        WHERE tenant_id = NEW.tenant_id AND standard_field_code = NEW.standard_field_code
          AND requiredness_context = 'WorkforceActivation' AND effective_until_at IS NULL),
      (SELECT allow_worker_visibility_preference FROM hcm.profile_field_default_policy
        WHERE field_code = NEW.standard_field_code AND requiredness_context = 'WorkforceActivation'),
      false) INTO allowed;
  ELSE
    SELECT CASE sensitivity WHEN 'DirectorySafe' THEN 'Organization' WHEN 'Personal' THEN 'Manager' ELSE 'Hr' END
      INTO ceiling FROM hcm.custom_field_definition
      WHERE tenant_id = NEW.tenant_id AND id = NEW.custom_field_id;
    SELECT coalesce(
      (SELECT allow_worker_visibility_preference FROM hcm.profile_field_tenant_policy
        WHERE tenant_id = NEW.tenant_id AND custom_field_id = NEW.custom_field_id
          AND requiredness_context = 'WorkforceActivation' AND effective_until_at IS NULL),
      false) INTO allowed;
  END IF;
  IF ceiling IS NULL THEN
    RAISE EXCEPTION 'Profile field is unknown' USING ERRCODE = '23503';
  END IF;
  IF NEW.effective_until_at IS NULL AND (NOT allowed OR
     array_position(ARRAY['Self','Hr','Manager','Organization'], NEW.visibility)
       > array_position(ARRAY['Self','Hr','Manager','Organization'], ceiling)) THEN
    RAISE EXCEPTION 'Worker profile preference is not allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$preference$;
CREATE TRIGGER profile_preference_allowed BEFORE INSERT OR UPDATE ON hcm.profile_visibility_preference
  FOR EACH ROW EXECUTE FUNCTION hcm.require_profile_preference_allowed();

-- A value belongs to the owner its definition names, uses the column of its data type, and keeps
-- Sensitive and Restricted content in ciphertext only.
CREATE FUNCTION hcm.require_custom_field_value_shape() RETURNS trigger LANGUAGE plpgsql AS $shape$
DECLARE field record;
BEGIN
  SELECT owner_scope, data_type, sensitivity INTO field FROM hcm.custom_field_definition
    WHERE tenant_id = NEW.tenant_id AND id = NEW.custom_field_id;
  IF (field.owner_scope = 'Person' AND NEW.person_id IS NULL)
     OR (field.owner_scope = 'Worker' AND NEW.worker_id IS NULL)
     OR (field.owner_scope = 'Employment' AND NEW.employment_id IS NULL)
     OR (field.owner_scope = 'Assignment' AND NEW.assignment_id IS NULL) THEN
    RAISE EXCEPTION 'Custom field value owner does not match its definition' USING ERRCODE = '23514';
  END IF;
  IF field.sensitivity IN ('Sensitive','Restricted') THEN
    IF num_nonnulls(NEW.text_value, NEW.integer_value, NEW.decimal_value, NEW.date_value, NEW.boolean_value) > 0 THEN
      RAISE EXCEPTION 'Protected custom field values must be encrypted' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.encrypted_value IS NOT NULL
     OR (field.data_type IN ('Text','LongText') AND num_nonnulls(NEW.integer_value, NEW.decimal_value, NEW.date_value, NEW.boolean_value) > 0)
     OR (field.data_type = 'Integer' AND num_nonnulls(NEW.text_value, NEW.decimal_value, NEW.date_value, NEW.boolean_value) > 0)
     OR (field.data_type = 'Decimal' AND num_nonnulls(NEW.text_value, NEW.integer_value, NEW.date_value, NEW.boolean_value) > 0)
     OR (field.data_type = 'Date' AND num_nonnulls(NEW.text_value, NEW.integer_value, NEW.decimal_value, NEW.boolean_value) > 0)
     OR (field.data_type = 'Boolean' AND num_nonnulls(NEW.text_value, NEW.integer_value, NEW.decimal_value, NEW.date_value) > 0)
     OR (field.data_type IN ('SingleSelect','MultiSelect') AND num_nonnulls(NEW.text_value, NEW.integer_value, NEW.decimal_value, NEW.date_value, NEW.boolean_value) > 0) THEN
    RAISE EXCEPTION 'Custom field value does not match its data type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$shape$;
CREATE CONSTRAINT TRIGGER custom_field_value_shape AFTER INSERT OR UPDATE ON hcm.custom_field_value
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_custom_field_value_shape();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['custom_field_definition','custom_field_option','profile_field_tenant_policy','profile_visibility_preference','custom_field_value','custom_field_value_option','employee_command_receipt'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

GRANT SELECT ON hcm.profile_field_definition, hcm.profile_field_default_policy TO hcm_runtime;
GRANT INSERT ON hcm.custom_field_definition, hcm.custom_field_option, hcm.profile_field_tenant_policy, hcm.profile_visibility_preference, hcm.employee_command_receipt TO hcm_runtime;
-- Codes, owner scope, data type and sensitivity are fixed for life; policy rows are closed, never rewritten.
GRANT UPDATE (name,description,section_code,sort_order,is_active,revision,updated_at,updated_by_account_id) ON hcm.custom_field_definition TO hcm_runtime;
GRANT UPDATE (name,sort_order,is_active,revision,updated_at,updated_by_account_id) ON hcm.custom_field_option TO hcm_runtime;
GRANT UPDATE (effective_until_at,superseded_by_id,revision,updated_at,updated_by_account_id) ON hcm.profile_field_tenant_policy, hcm.profile_visibility_preference TO hcm_runtime;
-- Custom field values are written by the consuming apps, which add their own grants.

INSERT INTO hcm.profile_field_definition
  (code,name,description,section_code,source_entity,source_attribute,sensitivity,maximum_visibility,is_searchable_when_visible,sort_order)
VALUES
  ('display-name','Display name','Name shown across the organisation, derived from the legal and preferred names.','Identity','person','display_name','DirectorySafe','Organization',true,10),
  ('legal-given-name','Legal first name','','Identity','person','given_name','Personal','Hr',false,20),
  ('legal-middle-name','Legal middle name','','Identity','person','middle_name','Personal','Hr',false,30),
  ('legal-family-name','Legal last name','','Identity','person','family_name','Personal','Hr',false,40),
  ('preferred-name','Preferred name','','Identity','person','preferred_name','DirectorySafe','Organization',true,50),
  ('former-name','Former name','','Identity','person','former_name','Personal','Hr',false,60),
  ('worker-number','Worker number','','Identity','worker','worker_code','DirectorySafe','Organization',true,70),
  ('birth-date','Birth date','','Personal','person','birth_date','Personal','Hr',false,110),
  ('gender','Gender','','Personal','person','gender_code','Sensitive','Hr',false,120),
  ('marital-status','Marital status','','Personal','person','marital_status_code','Personal','Hr',false,130),
  ('nationality','Nationality','','Personal','person','nationality_country_code','Personal','Hr',false,140),
  ('blood-group','Blood group','Employee-supplied; read for emergencies by authorized HR.','Personal','person','blood_group','Sensitive','Hr',false,150),
  ('work-email','Work email','','Contact','employment','work_email','DirectorySafe','Organization',true,210),
  ('personal-email','Personal email','Stored unverified; never used for delivery or recovery.','Contact','person_contact_point','PersonalEmail','Personal','Hr',false,220),
  ('mobile-phone','Mobile phone','Stored unverified; never used for delivery or recovery.','Contact','person_contact_point','MobilePhone','Personal','Hr',false,230),
  ('home-address','Address','','Contact','person_address','address','Personal','Hr',false,240),
  ('emergency-contacts','Emergency contacts','','Contact','person_relationship','emergency_contact','Personal','Hr',false,250),
  ('family-members','Family and dependants','','Contact','person_relationship','family_relation','Personal','Hr',false,260),
  ('legal-entity','Legal entity','','Employment','employment','legal_entity_id','DirectorySafe','Organization',false,310),
  ('worker-type','Worker type','','Employment','worker','worker_type_id','Personal','Manager',false,320),
  ('employment-type','Employment type','','Employment','employment','employment_type','Personal','Manager',false,330),
  ('employment-status','Employment status','','Employment','employment','employment_status','Personal','Manager',false,340),
  ('hire-date','Hire date','','Employment','employment','hire_date','Personal','Manager',false,350),
  ('continuous-service-start-date','Continuous service start','','Employment','employment','continuous_service_start_date','Personal','Manager',false,360),
  ('probation','Probation','Probation status and end date.','Employment','employment','probation_status','Personal','Manager',false,370),
  ('notice-period','Notice period','','Employment','employment','notice_period_days','Personal','Manager',false,380),
  ('rehire-eligibility','Rehire eligibility','','Employment','employment','is_eligible_for_rehire','Personal','Manager',false,390),
  ('organisation-unit','Organisation unit','','Assignment','assignment','organisation_id','DirectorySafe','Organization',false,410),
  ('department','Department','','Assignment','assignment','department_id','DirectorySafe','Organization',false,420),
  ('designation','Designation','','Assignment','assignment','designation_id','DirectorySafe','Organization',false,430),
  ('location','Location','','Assignment','assignment','location_id','DirectorySafe','Organization',false,440),
  ('manager','Manager','Primary solid reporting line.','Assignment','reporting_line','manager_assignment_id','DirectorySafe','Organization',false,450),
  ('work-mode','Work mode','','Assignment','assignment','work_mode','DirectorySafe','Organization',false,460),
  ('full-time-equivalent','Full-time equivalent','','Assignment','assignment','full_time_equivalent','Personal','Manager',false,470),
  ('standard-hours','Standard weekly hours','','Assignment','assignment','standard_hours_per_week','Personal','Manager',false,480),
  ('cost-centre','Cost centre','','Assignment','assignment','cost_center_code','Personal','Manager',false,490);

INSERT INTO hcm.profile_field_default_policy
  (field_code,requiredness_context,requiredness,visibility,self_edit_mode,allow_worker_visibility_preference)
VALUES
  ('display-name','WorkforceActivation','Optional','Organization','NotEditable',false),
  ('legal-given-name','WorkforceActivation','Required','Hr','ServiceRequest',false),
  ('legal-middle-name','WorkforceActivation','Optional','Hr','ServiceRequest',false),
  ('legal-family-name','WorkforceActivation','Required','Hr','ServiceRequest',false),
  ('preferred-name','WorkforceActivation','Optional','Organization','Direct',true),
  ('former-name','WorkforceActivation','Optional','Hr','NotEditable',false),
  ('worker-number','WorkforceActivation','Required','Organization','NotEditable',false),
  ('birth-date','WorkforceActivation','Optional','Hr','ServiceRequest',false),
  ('gender','WorkforceActivation','Optional','Hr','ServiceRequest',false),
  ('marital-status','WorkforceActivation','Optional','Hr','ServiceRequest',false),
  ('nationality','WorkforceActivation','Optional','Hr','ServiceRequest',false),
  ('blood-group','WorkforceActivation','Optional','Hr','Direct',false),
  ('work-email','WorkforceActivation','Recommended','Organization','NotEditable',false),
  ('personal-email','WorkforceActivation','Optional','Hr','Direct',false),
  ('mobile-phone','WorkforceActivation','Optional','Hr','Direct',false),
  ('home-address','WorkforceActivation','Optional','Hr','ServiceRequest',false),
  ('emergency-contacts','WorkforceActivation','Optional','Hr','Direct',false),
  ('family-members','WorkforceActivation','Optional','Hr','Direct',false),
  ('legal-entity','WorkforceActivation','Required','Organization','NotEditable',false),
  ('worker-type','WorkforceActivation','Required','Manager','NotEditable',false),
  ('employment-type','WorkforceActivation','Required','Manager','NotEditable',false),
  ('employment-status','WorkforceActivation','Required','Manager','NotEditable',false),
  ('hire-date','WorkforceActivation','Required','Manager','NotEditable',false),
  ('continuous-service-start-date','WorkforceActivation','Optional','Manager','NotEditable',false),
  ('probation','WorkforceActivation','Optional','Manager','NotEditable',false),
  ('notice-period','WorkforceActivation','Optional','Manager','NotEditable',false),
  ('rehire-eligibility','WorkforceActivation','Optional','Manager','NotEditable',false),
  ('organisation-unit','WorkforceActivation','Required','Organization','NotEditable',false),
  ('department','WorkforceActivation','Recommended','Organization','NotEditable',false),
  ('designation','WorkforceActivation','Recommended','Organization','NotEditable',false),
  ('location','WorkforceActivation','Required','Organization','NotEditable',false),
  ('manager','WorkforceActivation','Recommended','Organization','NotEditable',false),
  ('work-mode','WorkforceActivation','Optional','Organization','NotEditable',false),
  ('full-time-equivalent','WorkforceActivation','Optional','Manager','NotEditable',false),
  ('standard-hours','WorkforceActivation','Optional','Manager','NotEditable',false),
  ('cost-centre','WorkforceActivation','Optional','Manager','NotEditable',false);
