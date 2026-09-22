# hcm-web-ux-feature-theme-lab

Owns the lazy HCM UX Foundation Lab: native ShellBar, Home/Demo/Settings, FCL Employee/Leave/Projects examples, and the semantic theme workshop. LabDemo consumes the reusable `HcmToolPageLayout`; LabProfile consumes `HcmObjectPage` and `HcmObjectSection`. Both floorplans live under `libs/hcm/web/ux/floorplans`; this feature supplies fictional data, native content controls and local actions. It does not implement business transactions or a duplicate layout engine. The avatar menu switches themes, and compact density is the default.

Import through `@empflowyee/hcm-web-ux-feature-theme-lab`. See the [Foundation Lab maintainer guide](../../../../../docs/hcm/ux/theme-lab/README.md) for architecture, constraints and workflows.

```sh
pnpm nx lint hcm-web-ux-feature-theme-lab
pnpm nx test hcm-web-ux-feature-theme-lab
```
