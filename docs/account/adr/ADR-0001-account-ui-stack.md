# ADR-0001: Account UI Stack

- Status: Accepted
- Date: 2026-09-21

Account uses Angular 22+ and Spartan. Styled Helm components are owned/copied into Account-controlled libraries when introduced by the Spartan CLI; headless behavior comes from Spartan Brain primitives.

Account owns its own light/dark and HER-inspired theme implementation while consuming platform semantic design tokens.
