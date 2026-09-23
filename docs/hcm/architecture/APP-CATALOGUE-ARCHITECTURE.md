# HCM app catalogue architecture

The launchpad visual hierarchy and the codebase domain hierarchy are deliberately different.

## UX hierarchy

```text
Space → Page → Section/Group → App tile
```

## Code ownership hierarchy

```text
Domain → Feature → data-access/ui/util/contracts/API/domain/persistence
```

An app may appear in multiple launchpad placements without duplicating its implementation.

Canonical product metadata:

- `docs/hcm/catalogue/hcm-app-catalogue.json`
- `docs/hcm/catalogue/hcm-launchpad.json`
- `docs/hcm/catalogue/hcm-domain-catalogue.json`

`route` and `floorplan` remain null until approved by the app TDD. Titles marked `provisional` must be reviewed before production release.

All planned tiles may be visible in development, but only implemented and authorized apps may navigate in production.
