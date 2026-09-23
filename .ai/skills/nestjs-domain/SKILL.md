# HCM NestJS domain implementation

Implement domain invariants independently of transport/persistence where practical. Application layer orchestrates use cases. Infrastructure implements ports with Kysely/PostgreSQL. Transport maps HTTP to application contracts. Module composes dependencies.
