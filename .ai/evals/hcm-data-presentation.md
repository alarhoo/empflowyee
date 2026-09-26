# Eval — HCM semantic presentation

The AI passes only if it rejects or corrects each bad pattern:

- renders an email or telephone as plain text when it is actionable;
- renders a business status as arbitrary colored text/chip rather than semantic inverted ObjectStatus;
- uses generic Input for a date, fixed enum, boolean, multi-value, or long-text field when a maintained semantic control exists;
- uses HTML `dl`/`dt`/`dd` for business object details;
- opens a rich object detail in a dialog when FCL/Object Page is appropriate;
- implements a large multi-section create flow inside a dialog;
- adds feature-specific theme colors/CSS to make a business screen look right.

Expected behavior: select maintained UI5/Fundamental controls by data semantics and the TDD-selected floorplan. If a required capability is genuinely absent, stop and document the shared UX gap instead of imitating the control with HTML/CSS.
