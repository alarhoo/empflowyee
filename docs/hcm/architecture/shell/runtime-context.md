# HCM Runtime Context

The shell requires a single normalized runtime context before presenting the licensed/authorized experience.

Current milestone uses fixture data. Future production bootstrap should resolve, in one server-owned transaction where practical:

- validated tenant;
- authenticated HCM principal;
- employee/person reference;
- effective roles/permissions;
- tenant entitlements;
- tenant branding/theme defaults;
- user presentation preferences;
- locale/timezone presentation configuration.

The browser hostname may identify a tenant candidate, but the server must validate tenant membership and session authorization.
