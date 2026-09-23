# HCM Presentation Locale Model

Preference resolution:

```text
user override → tenant default → platform fallback
```

Presentation preferences can include language, locale, display timezone, date format, time format, and number format.

They must not define business/legal behavior. Payroll jurisdiction, employment timezone, work-location holiday calendar, legal entity currency, and tax rules remain domain data.

The production runtime now resolves language, locale, timezone, date format, time format, number format and density independently through `resolveHcmPreferences`. The read-only runtime preference selector exposes the effective settings to features. UI5 language and Fundamental density are applied through their maintained APIs; the document language is synchronized. Locale-asset failures are visible.

There are no domain date/number fields in this milestone. Feature formatters must consume the resolved locale/timezone/format settings explicitly rather than use global browser timezone or employment defaults. Angular's bootstrap-time `LOCALE_ID` is not mutated, and the private UI5 timezone configuration API is not used. Shell copy remains English; native-control language assets follow the resolved language. Full translated shell copy and a preference-editing workflow are separate work.
