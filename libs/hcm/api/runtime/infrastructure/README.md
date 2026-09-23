# hcm-api-runtime-infrastructure

Owns fail-closed unconfigured adapters and explicitly opted-in loopback-only tenant discovery. It contains no fake session adapter.

See the [shell maintainer guide](../../../../../docs/hcm/architecture/shell/README.md). The HCM API build compiles this non-buildable library. Boundary integration tests run with `pnpm nx test hcm-api-runtime-module`.
