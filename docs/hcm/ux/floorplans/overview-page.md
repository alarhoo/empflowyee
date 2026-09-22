# Overview Page

**Floorplan ID:** `UX-FP-OVERVIEW`  
**HCM implementation:** **COMPOSED**

Use for a role-based summary across multiple topics. Cards/tiles must link to real features and respect entitlements/authorization from the shell context.

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
