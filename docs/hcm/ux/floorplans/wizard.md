# Wizard

**Floorplan ID:** `UX-FP-WIZARD`  
**HCM implementation:** **NATIVE**

Use for guided, ordered multi-step processes. Step validity is owned by the feature/form model; the floorplan does not invent business progression rules.

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
