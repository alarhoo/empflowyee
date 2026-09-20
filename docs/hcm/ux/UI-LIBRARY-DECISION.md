# HCM UI Library Decision

## Approved direction

Use Fundamental NGX as the maintained Angular integration surface for UI5 Web Components.

This is not a choice between “Fundamental” and “UI5 Web Components” as unrelated systems: Fundamental NGX contains maintained Angular wrappers around UI5 Web Components plus Angular-native SAP Design System components/composites.

## Import discipline

Prefer secondary entry points for UI5 wrappers to avoid unnecessary bundle registration.

Example:

```ts
import { Button } from '@fundamental-ngx/ui5-webcomponents/button';
```

Avoid broad barrel imports when a narrower entry point exists.

## AI/tooling

Fundamental NGX publishes machine-readable component information and AI-oriented tooling. Future HCM UI skills should query/use that knowledge before generating custom UI abstractions.

## Explicit rejection

Do not introduce `@ui5/webcomponents-ngx`; it is deprecated.
