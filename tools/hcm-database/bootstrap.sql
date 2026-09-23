-- Explicit administrator provisioning, once, on a new dedicated PostgreSQL instance.
-- Run with psql connected to postgres; passwords arrive through environment, not source.
\set ON_ERROR_STOP on
\getenv migrator_password HCM_MIGRATOR_PASSWORD
\getenv runtime_password HCM_RUNTIME_PASSWORD

CREATE ROLE hcm_migrator LOGIN PASSWORD :'migrator_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hcm_runtime LOGIN PASSWORD :'runtime_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE DATABASE hcm_db OWNER hcm_migrator;
-- This script provisions local infrastructure only. Production migrations never install this marker.
COMMENT ON DATABASE hcm_db IS 'empflowyee:local-development:dunder-mifflin';
REVOKE ALL ON DATABASE hcm_db FROM PUBLIC;
GRANT CONNECT ON DATABASE hcm_db TO hcm_runtime;
\connect hcm_db
REVOKE ALL ON SCHEMA public FROM PUBLIC;
