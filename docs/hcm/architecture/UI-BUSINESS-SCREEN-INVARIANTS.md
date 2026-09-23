# HCM business-screen UI invariants

## Critical rule: business features are theme-agnostic

When an agent implements `EMPLOYEE_DIRECTORY`, `APPLY_LEAVE`, `MY_PROFILE`, or any other business app, it **does not implement, select, or style for HER/Horizon**.

The feature's responsibility is:

- use the TDD-selected approved floorplan;
- use supported UI5/Fundamental controls;
- bind business data and state;
- implement accessibility and responsive behavior through the approved floorplan/control APIs;
- display semantic business status through approved semantic component properties/tokens.

The feature must not care whether the runtime theme is Horizon Light, Horizon Dark, HER Light, HER Dark, or a tenant-branded variant.

Theme selection belongs to the HCM shell/theme system and is applied globally.

## Forbidden in business features

- importing HER theme implementation;
- importing Horizon theme implementation merely to style a feature;
- raw brand hex/RGB/HSL colors;
- theme-specific selectors such as `.her-*`;
- deep styling UI5 Shadow DOM;
- rebuilding native UI5 controls with HTML/CSS;
- arbitrary pixel styling to imitate a floorplan;
- per-feature theme switching;
- custom CSS merely because the agent dislikes native spacing.

Custom CSS is **forbidden by default**, not absolutely impossible. A genuine capability gap must be documented in the TDD and implemented in an approved shared UX/floorplan library rather than hidden inside a business feature.

## Mental model

```text
Business feature
    ├── approved floorplan
    ├── UI5/Fundamental controls
    └── business data/state

HCM shell / UX foundation
    └── active global theme + tenant branding
```

The business feature is the same code under every approved theme.
