# HCM Signal Form

## Use when

Building a new HCM data-entry/edit form.

## Procedure

1. Use Angular Signal Forms unless the TDD records an exception.
2. Define a typed form model and validation schema.
3. Apply `../hcm-data-presentation/SKILL.md` so each field uses the semantic maintained control for its data type.
4. Use UI5/Fundamental form layout primitives verified against installed wrappers.
5. Implement dirty state, save/cancel, submission and backend error mapping.
6. Keep authoritative business validation on the backend; client validation improves interaction but is not the business authority.
7. Add accessible labels, descriptions and errors.
8. Test our validation/orchestration and important state transitions. Do not create Storybook work unless explicitly requested.
