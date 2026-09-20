# Localization and Regional Preferences

## Preference resolution

Presentation preferences resolve in this order:

```text
user preference
   -> tenant default
      -> platform fallback
```

Tenant onboarding may configure:

- language
- locale
- timezone
- date format
- time format
- number format
- currency display preference
- first day of week

Users may override allowed presentation preferences.

## Critical separation

Presentation locale does not determine business rules.

Business context such as payroll jurisdiction, holiday calendar, legal entity, work location, employment timezone, and tax rules must come from domain data, not from a user's display preference.
