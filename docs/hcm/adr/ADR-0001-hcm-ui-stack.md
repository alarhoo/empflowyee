# ADR-0001: HCM UI Stack

- Status: Accepted
- Date: 2026-09-21

## Decision

HCM uses Angular 22+ with the maintained Fundamental NGX ecosystem around UI5 Web Components.

Approved packages include, when required:

- `@fundamental-ngx/ui5-webcomponents`
- `@fundamental-ngx/ui5-webcomponents-fiori`
- `@fundamental-ngx/core`
- `@fundamental-ngx/platform`
- `@fundamental-ngx/cdk`
- UI5 Web Components packages required by those wrappers

The deprecated `@ui5/webcomponents-ngx` package is rejected.

## Component selection order

1. maintained UI5 Web Component/wrapper
2. Fundamental NGX Platform composite when it adds useful enterprise/Angular behavior
3. Fundamental NGX Core component
4. empFLOWyee-owned composition only when the approved libraries cannot satisfy the UX specification

## Floorplans

Do not recreate SAP-maintained primitives manually. The capability matrix decides whether a floorplan is native, composed, or custom.

## Theme

HCM starts with Horizon light/dark and supports empFLOWyee HER light/dark themes plus a controlled tenant primary-color overlay.
