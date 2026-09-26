# Employee — Standard Profile and Directory Policy

This is the initial product baseline for standard employee/profile fields. Requiredness is contextual, not a permanent database property. Tenants may narrow visibility/editability but may not widen product privacy limits.

| Field group | Default requiredness | Employee change mode | Maximum ordinary visibility | Directory/search ceiling |
|---|---|---|---|---|
| Legal first/last name | Required at workforce activation | Correction/service request | Organization display name; full parts for self and authorized HR | Display + normalized-name search |
| Preferred name | Optional | Direct self-edit | Organization | Display/search when present |
| Employment work email | Recommended; required only by a named tenant communication policy | Not self-editable | Organization | Display + exact/prefix search |
| Personal email/mobile | At least one verified value only when recovery/delivery requires it | Direct self-edit + verification | Self + authorized HR | Never |
| Birth date | Optional until a named payroll/benefit/statutory context requires it | Correction/service request | Self + authorized HR | Never |
| Gender, marital status, nationality | Optional until a named context requires it | Correction/service request | Self + authorized HR | Never |
| Address | Optional initially; contextual later | Correction/service request | Self + authorized HR | Never |
| Blood group | Optional and employee-supplied | Direct self-edit | Self + emergency-purpose authorized HR | Never |
| Emergency contacts | Recommended only when a named safety policy requires it | Direct self-edit | Self + authorized HR | Never |
| Family/dependants | Optional until a named benefit context requires it | Direct self-edit | Self + authorized HR | Never |
| Statutory nominee/share | Only for a named statutory workflow | Correction/service request | Self + authorized HR/payroll | Never |
| Self-declared skills | Optional | Direct self-edit; saved unverified | Self + scoped manager + authorized HR | Governed by Skills domain |
| Education/work experience/languages/self-declared certifications | Optional | Direct self-edit; saved unverified | Self + scoped manager + authorized HR | Never |
| Worker number | Required at workforce activation | Not self-editable | Organization | Display + exact/prefix search |
| Legal entity/org unit/department/designation/location/manager | Required where tenant structure makes field applicable | Employment-change command | Organization | Display/filter allowed |
| Employment type/status/service dates | Required where applicable | Not self-editable | Self + scoped manager + authorized HR | Not broad-searchable |
| Work mode | Optional tenant field | Employment-change command | Organization when enabled | Display/filter when enabled |
| FTE/hours/cost centre/rehire/probation facts | Contextual | Not self-editable | Self + scoped manager + authorized HR | Never broad-searchable |
| Identification/statutory values | Only for named statutory workflow | Verified write/request + masked read | Self + explicitly authorized HR/payroll | Never |
| Profile photo | Requires governed document/photo contract | Defined by approved TDD | Defined by approved TDD | No search |

Any standard field not listed here defaults to **Optional**, **NotEditable**, visible only to **Self + authorized HR**, and excluded from preferences, directory, search, ordinary export and notification payloads.
