# Next steps

The seven Dockerfiles, runtime validation, local images and local browser/API checks are complete. Shared and DEV foundations are applied with no drift; folder placement and scoped IAM migration are verified. The Cloud Run roots have provider-backed validation and mocked plan tests, and the live DEV service plan proposes seven additions with no updates or deletions.

1. Review [DEV foundation readiness](docs/platform/engineering/cloud-run-readiness.md) and the infrastructure source through the existing PR process.
2. Refresh and review the DEV Cloud Run plan, then create the private service shells when authorized. No Cloud Run service has been applied yet. A Google hello placeholder is not a successful empFLOWyee release.
3. Verify the configured GitHub `cicd` and `dev` environments, main-only branch policies and Terraform output variables before activating release builds.
4. Complete the release identity handoff required by the current containers. Configure reviewed API endpoints before promoting Angular images.
5. Merge reviewed source, activate release builds once prerequisites are complete, build/push immutable application images through CI, and manually prove one private DEV deployment, preferably `hcm-api`.
6. Return to product work: HCM shell, tenant/session context, application catalog, theme engine and Theme Lab screens using the approved UX specifications.

Keep public edge/DNS/wildcard routing, authentication changes and databases as separate architecture work. QA/PROD promotion and infrastructure apply remain explicit. Do not enable the infrastructure pipeline until its dedicated identity and state-access design are approved.
