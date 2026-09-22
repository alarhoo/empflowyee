# Dynamic Page

**Floorplan ID:** `UX-FP-DYNAMIC-PAGE`  
**HCM implementation:** **NATIVE**

Use when the title/actions must remain available while contextual header content can expand/collapse. HCM consumes the maintained UI5 DynamicPage through the Fundamental NGX wrapper. No empFLOWyee wrapper library is created.

## Required Storybook states

- representative populated state
- loading where asynchronous content exists
- empty/first-use where relevant
- error/retry where relevant
- unavailable/not-entitled where relevant
- narrow, medium and wide viewport behavior
- Horizon Light/Dark and HER Light/Dark
- at least one tenant-primary-color override

## Security boundary

Visual visibility is not authorization. Backend authorization remains mandatory.
