# HCM Shell Architecture

The HCM shell is the composition layer for the single HCM Angular SPA.

It owns global chrome and composition concerns only:

- current runtime context;
- Space navigation;
- routing outlet;
- global theme application;
- future global notifications/search/profile actions.

It does not own business-domain behavior.

## Fiori-like experience model

The product experience remains:

```text
Space → Page → Group → Feature/App tile → lazy route
```

The filesystem remains domain-oriented. Navigation placement does not determine source-code ownership.

A single feature may appear in more than one Space/Page without duplicating implementation.
