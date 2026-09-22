# Next steps

The first runnable DEV foundation is complete: all seven apps were built, smoke-tested, published and promoted through GitHub. The four web apps open directly in a browser; the three APIs remain IAM-protected until application authentication is implemented. Browser, asset, runtime-configuration and authorized API checks pass. See [URLs and deployment evidence](docs/platform/engineering/dev-deployment.md).

1. Return to product work: HCM shell, tenant/session context, Spaces/Pages and application catalog using the approved business-domain library structure.
2. Implement the theme engine and Theme Lab using the approved UI5/Fundamental UX specifications, including Horizon/HER light and dark themes and tenant color preferences.
3. Add the agreed dummy object-page, flexible-column, table and form screens through approved FDD/TDDs. Do not invent missing business behavior.
4. Implement browser-to-API authentication and authorization through approved product designs before exposing business endpoints. Account, HCM and Console have distinct trust contexts.
5. For future releases, build once on main and manually promote the existing digest, sequentially per environment. Preserve the [approved DEV public-web/private-API split](docs/platform/security/cloud-run-access-baseline.md).

Keep production edge/DNS/wildcard routing, authentication changes and databases as separate architecture work. QA/PROD promotion and infrastructure apply remain explicit. Do not enable the infrastructure pipeline until its dedicated identity and state-access design are approved. See [the delivery roadmap](docs/platform/engineering/ci-cd-foundation-plan.md) for completed and deferred engineering work.
