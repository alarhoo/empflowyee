# hcm-web-attendance-ui-schedule-pattern

Attendance-owned weekly-pattern conversion, Signal Form state and maintained
UI5 fields shared by schedule features. The feature owns its page, data queries,
source revision, runtime context, command submission and routing. This library
accepts state and formatting inputs and does not import HTTP or runtime services.

`SchedulePatternState` validates the complete universal schedule DTO. Its default
template mode is preserved for Work Schedule Templates; ordinary schedule owners
explicitly set `isTemplate` to false. Proposed unpaid minutes still need explicit
interval placement, and neither timezone nor statutory rest is invented.
