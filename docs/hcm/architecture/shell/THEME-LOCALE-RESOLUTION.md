# Theme and Locale Resolution

## Theme

A tenant that disallows user themes retains its enforced default. Otherwise:

```text
saved local variant or explicit Follow device choice
  -> explicit server user preference
    -> device color scheme (live)
```

A saved variant selects both family and mode. Device mode uses the server user/tenant
family; legacy saved light/dark values also preserve that family.
Tenant primary color is a separate controlled branding overlay. The shell's native
button beside the avatar opens a native menu for Horizon Light/Dark, HER Light/Dark
and Follow device. It persists only this appearance choice locally.
The profile dropdown contains identity and persona preferences, not theme controls.
Pre-auth pages use the same appearance resolution and respect locked tenant policy.

## Locale

```text
user preference
  -> tenant default
    -> platform fallback
```

Presentation preferences may include:

- language
- locale
- timezone
- date/time/number formats
- density

Do not infer payroll, tax, holiday, legal entity or employment jurisdiction from presentation preferences.
