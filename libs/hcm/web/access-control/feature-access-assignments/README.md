# Access Assignments

Domain-owned lazy feature using native FlexibleColumnLayout and the shared Object
Page. The begin column owns server account filters; account selection uses the
`account` query parameter. Focused Signal Forms dialogs invoke the assignment API.
No feature CSS, business fixtures or assignment persistence logic lives here.

See the [approved design](../../../../../docs/hcm/apps/access-assignments/TDD.md)
and [validation](../../../../../docs/hcm/testing/HCM-1-ACCESS-ASSIGNMENTS-VALIDATION.md).

Generated with the official Nx Angular library generator for this admitted slice:

```bash
pnpm nx g @nx/angular:library libs/hcm/web/access-control/feature-access-assignments --name=hcm-web-access-control-feature-access-assignments --standalone --changeDetection=OnPush --style=none --skipTests --skipPackageJson --unitTestRunner=none --linter=eslint --tags=product:hcm,runtime:web,domain:access-control,type:feature --importPath=@empflowyee/hcm-web-access-control-feature-access-assignments
```

The generated selector prefix is reconciled to the repository's `ef-hcm` prefix.
Browser integration tests cover this real component against PostgreSQL; the shared
floorplan's isolated state and interaction tests remain in its UX library.
