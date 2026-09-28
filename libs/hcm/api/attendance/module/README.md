# hcm-api-attendance-module

Composes Attendance application ports, tenant-authorized Kysely adapters and
admitted Nest controllers. The API root imports this module. Migration execution
and durable scheduling do not run here; the shared worker owns admitted jobs.
