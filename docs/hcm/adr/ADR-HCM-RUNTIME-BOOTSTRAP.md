# ADR — Two-stage HCM runtime bootstrap

## Decision

Separate tenant discovery from authenticated session bootstrap.

1. Public, minimal `GET /api/v1/runtime/tenant`
2. Authenticated `GET /api/v1/runtime/session`

## Why

The application needs safe tenant branding/auth discovery before the user is authenticated, but permissions, entitlements, user identity and employee information must not be exposed through a public endpoint.

## Consequence

The shell has an explicit runtime state machine and handles authentication-required as a normal state rather than an application startup failure.
