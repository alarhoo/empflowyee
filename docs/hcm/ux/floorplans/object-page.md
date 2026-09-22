# Object Page

**Floorplan ID:** `UX-FP-OBJECT-PAGE`  
**HCM implementation:** **COMPOSED**

Use for one business object with a header, prominent actions, status, semantic sections/subsections and display/edit states. Compose DynamicPage and maintained navigation/form primitives; avoid recreating UI5 internals.

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
