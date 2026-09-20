# Libraries

Library ownership hierarchy:

```text
product boundary -> runtime -> business domain -> Nx project type
```

Examples:

```text
libs/hcm/web/leave/feature-apply
libs/hcm/web/leave/data-access
libs/hcm/api/leave/domain
libs/hcm/api/leave/application
libs/hcm/contracts/leave
```

Do not create generic `common`, `shared-services`, `models`, or `helpers` dumping grounds.
