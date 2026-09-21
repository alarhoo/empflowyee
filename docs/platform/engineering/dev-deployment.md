# First DEV deployment — 2026-09-22

## Release and scope

Project: `empflowyee-dev`. Region: `asia-south1`. Application release: `09e146c24830720d89692194307c2cfe837dec77`.

All seven images were built and smoke-tested in [release run 35644695629](https://github.com/alarhoo/empflowyee/actions/runs/35644695629), then published to the immutable `asia-south1-docker.pkg.dev/empflowyee-cicd/apps` repository. Each image embeds the release SHA and was tested with DEV and QA runtime settings locally on its CI runner; no QA cloud resource was deployed.

Terraform initially created seven private service shells and configured the three Angular API endpoints. The four web services now have a direct browser-access configuration under [ADR: DEV web browser access](../adr/ADR-dev-web-browser-access.md); the three APIs remain IAM-protected. The manual GitHub workflows promote only the published image digests, sequentially within DEV. QA and PROD remain unchanged; infrastructure automation remains disabled.

## Service URLs

Open the four **Web** URLs directly in a browser. The three **API** URLs require Google IAM authentication. The browser apps are current scaffold screens; the APIs expose the scaffold greeting at `/api`. This milestone does not implement product authentication or browser-to-private-API authentication.

| App           | URL                                             |
| ------------- | ----------------------------------------------- |
| Marketing Web | https://marketing-web-bf3q2l4gtq-el.a.run.app   |
| Account Web   | https://account-web-bf3q2l4gtq-el.a.run.app     |
| Account API   | https://account-api-bf3q2l4gtq-el.a.run.app/api |
| HCM Web       | https://hcm-web-bf3q2l4gtq-el.a.run.app         |
| HCM API       | https://hcm-api-bf3q2l4gtq-el.a.run.app/api     |
| Console Web   | https://console-web-bf3q2l4gtq-el.a.run.app     |
| Console API   | https://console-api-bf3q2l4gtq-el.a.run.app/api |

## Initial release verification

All seven manual promotions succeeded. Each latest created revision is ready, receives 100% traffic and uses its own runtime identity and the exact published digest. During the initial private deployment, authenticated `/health/live` and `/health/ready` requests returned HTTP 200 for every app; unauthenticated requests returned HTTP 403. Those checks proved container health but did not satisfy browser access. The subsequent web-access correction requires anonymous browser and asset checks for all four web apps, while preserving IAM checks on the APIs.

The three APIs returned their real `Hello API` response. Marketing served its Next.js page and the expected DEV/release runtime metadata. Each Angular service served its HTML, compiled JavaScript and uncached runtime configuration with the correct release SHA and matching private API URL. These are scaffold checks, not product workflow or browser-authentication acceptance tests.

Fresh plans for `shared`, `environments/dev` and `cloud-run/dev` report no changes after deployment. Publication checks also proved startup, two runtime configurations, embedded release identity, non-root execution, graceful shutdown and missing-configuration rejection.

| Service         | Ready revision            | Successful deployment                                                             |
| --------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `marketing-web` | `marketing-web-00002-7kc` | [Run 35645930669](https://github.com/alarhoo/empflowyee/actions/runs/35645930669) |
| `account-web`   | `account-web-00003-lkh`   | [Run 35646086482](https://github.com/alarhoo/empflowyee/actions/runs/35646086482) |
| `account-api`   | `account-api-00002-lx8`   | [Run 35645622428](https://github.com/alarhoo/empflowyee/actions/runs/35645622428) |
| `hcm-web`       | `hcm-web-00003-7xv`       | [Run 35646209874](https://github.com/alarhoo/empflowyee/actions/runs/35646209874) |
| `hcm-api`       | `hcm-api-00002-znp`       | [Run 35645497976](https://github.com/alarhoo/empflowyee/actions/runs/35645497976) |
| `console-web`   | `console-web-00003-nsn`   | [Run 35646335725](https://github.com/alarhoo/empflowyee/actions/runs/35646335725) |
| `console-api`   | `console-api-00002-dbt`   | [Run 35645777349](https://github.com/alarhoo/empflowyee/actions/runs/35645777349) |

## Browser access and private API diagnostics

The four web apps must open at the HTTPS URLs above without a proxy, a Google IAM token or a local process. Their HTML, JavaScript, CSS and public runtime configuration are part of that browser-access contract. Application sign-in and authorization are separate product work.

The three APIs still require Google IAM authentication. For private API diagnostics, use an authenticated Cloud Run proxy as described in [Google's developer authentication guide](https://docs.cloud.google.com/run/docs/authenticating/developers):

```bash
gcloud run services proxy hcm-api --project=empflowyee-dev --region=asia-south1 --port=8080
```

Then open `http://localhost:8080/api`. The CLI requires its `cloud-run-proxy` component and uses the operator's existing Google login. This is an optional API diagnostic path, not a prerequisite for opening the web apps. No token belongs in Git or a URL.

## Reproducing runtime endpoint configuration

The ignored `infra/terraform/cloud-run/dev/api-endpoints.auto.tfvars.json` supplies the three non-secret `api_base_urls` values. On a new checkout, recover them from the existing service outputs before a Terraform plan; an empty map would remove those settings:

```powershell
$urls = terraform -chdir=infra/terraform/cloud-run/dev output -json service_urls | ConvertFrom-Json
@{
  api_base_urls = @{
    'account-web' = "$($urls.'account-api')/api"
    'hcm-web' = "$($urls.'hcm-api')/api"
    'console-web' = "$($urls.'console-api')/api"
  }
} | ConvertTo-Json | Set-Content infra/terraform/cloud-run/dev/api-endpoints.auto.tfvars.json
```

Keep the backend and variable files ignored. Plan immediately before infrastructure changes, and coordinate with application deployments. See [workflow concurrency](workflow-concurrency.md).

## Next product milestone

Return to HCM Shell and Theme Lab work using the approved HCM architecture and UI specifications. The four DEV web apps have an approved public delivery path. Production edge routing, browser/API authentication, secrets and databases remain separate design work. Before adding business operations, implement the product authentication and authorization contracts; public frontend delivery does not provide them.
