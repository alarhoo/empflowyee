# HCM Presentation Locale Model

Preference resolution:

```text
user override → tenant default → platform fallback
```

Presentation preferences can include language, locale, display timezone, date format, time format, and number format.

They must not define business/legal behavior. Payroll jurisdiction, employment timezone, work-location holiday calendar, legal entity currency, and tax rules remain domain data.

This milestone models the preferences but does not implement dynamic locale switching. UI5 settings that are initialization-sensitive must be applied before UI components bootstrap in the later production runtime-bootstrap milestone.
