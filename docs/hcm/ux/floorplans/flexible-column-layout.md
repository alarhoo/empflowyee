# Flexible Column Layout

**Floorplan ID:** `UX-FP-FCL`  
**HCM implementation:** **NATIVE**

Use for list-detail-detail navigation where context should remain visible across up to three columns. Route state must be deep-linkable; the layout itself does not own data.

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
