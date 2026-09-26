# HCM job architecture infrastructure

PostgreSQL adapters of the job architecture domain (`hcm-api-job-architecture-infrastructure`):
the Kysely catalogue and job profile reader and repository over the tables of migration
`000024`, and the unit of work that binds them to the verified access transaction. Kysely table
access stays inside this project.
