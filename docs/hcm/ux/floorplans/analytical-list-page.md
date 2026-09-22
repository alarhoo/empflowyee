# Analytical List Page

**Floorplan ID:** `UX-FP-ANALYTICAL-LIST`  
**HCM implementation:** **COMPOSED**

Use when analytical summary materially helps users understand/filter the detailed result set. Chart choice is a separate TDD decision; the floorplan defines regions and interaction contracts, not a charting library.

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
