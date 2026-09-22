# List Report

**Floorplan ID:** `UX-FP-LIST-REPORT`  
**HCM implementation:** **COMPOSED**

Use when the primary task is finding, filtering, sorting and acting on a collection. The floorplan coordinates search/filter/action/result regions; feature data-access owns queries.

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
