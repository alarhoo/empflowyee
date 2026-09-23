# HCM Shell Boot Sequence

```text
Angular starts
   |
   | local /assets/config.json already loaded by provideAppInitializer
   v
Runtime facade -> tenant-loading
   |
   | GET /api/v1/runtime/tenant
   v
+-----------------------------+
| unknown? -> tenant-not-found|
| suspended? -> status page   |
+-----------------------------+
   |
   | valid tenant
   | apply tenant default brand/theme/locale
   v
GET /api/v1/runtime/session
   |
   | 401 -> auth-required
   | error -> error
   v
session-loading
   |
   | resolve effective user preferences
   | apply theme/locale
   | compute access policy/catalog projection
   v
READY
   |
   +-> shell
       +-> visible Spaces
       +-> Pages/Groups/Features
       +-> lazy feature router outlet
```

The browser may parse the tenant slug from `window.location.hostname` for display/local convenience, but backend tenant discovery is authoritative.
