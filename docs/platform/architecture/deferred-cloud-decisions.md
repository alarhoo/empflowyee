# Deferred cloud decisions

The following are intentionally not guessed in the cloud-foundation phase.

## Container/runtime design

Next phase determines:

- Angular container strategy and runtime `config.json`
- Next.js standalone/server runtime configuration
- NestJS production container
- health/readiness endpoints
- image hardening
- Cloud Run CPU/memory/concurrency/min/max instance defaults

## Cloud SQL

Before creating billable database infrastructure, decide:

- instance tier for DEV/QA/PROD
- HA expectations
- private vs public IP strategy
- VPC topology
- backup/PITR retention
- connection pooling/proxy strategy
- migration ownership

## Ingress/DNS/TLS

Before editing Hostinger DNS, decide the external ingress/load-balancer and certificate architecture for:

- empflowyee.com
- account.empflowyee.com
- console.empflowyee.com
- *.empflowyee.com
