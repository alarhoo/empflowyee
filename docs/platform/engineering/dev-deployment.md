# First DEV deployment — 2026-09-22

## Release and scope

Project: `empflowyee-dev`. Region: `asia-south1`. Application release: `09e146c24830720d89692194307c2cfe837dec77`.

All seven images were built and smoke-tested in [release run 35644695629](https://github.com/alarhoo/empflowyee/actions/runs/35644695629), then published to the immutable `asia-south1-docker.pkg.dev/empflowyee-cicd/apps` repository. Each image embeds the release SHA and was tested with DEV and QA runtime settings locally on its CI runner; no QA cloud resource was deployed.

Terraform created seven private service shells and configured the three Angular API endpoints. The manual GitHub workflows promote only the published image digests, sequentially within DEV. QA and PROD remain unchanged; infrastructure automation remains disabled.

## Service URLs

These URLs require Google IAM authentication. The browser apps are the current scaffold screens; the APIs expose the scaffold greeting at `/api`. This milestone does not implement product authentication or browser-to-private-API authentication.

| App           | URL                                             |
| ------------- | ----------------------------------------------- |
| Marketing Web | https://marketing-web-bf3q2l4gtq-el.a.run.app   |
| Account Web   | https://account-web-bf3q2l4gtq-el.a.run.app     |
| Account API   | https://account-api-bf3q2l4gtq-el.a.run.app/api |
| HCM Web       | https://hcm-web-bf3q2l4gtq-el.a.run.app         |
| HCM API       | https://hcm-api-bf3q2l4gtq-el.a.run.app/api     |
| Console Web   | https://console-web-bf3q2l4gtq-el.a.run.app     |
| Console API   | https://console-api-bf3q2l4gtq-el.a.run.app/api |

## Verification

All seven manual promotions succeeded. Each latest created revision is ready, receives 100% traffic and uses its own runtime identity and the exact published digest. Authenticated `/health/live` and `/health/ready` requests returned HTTP 200 for every app; unauthenticated requests returned HTTP 403.

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

## Opening private services

A normal browser request without a Google identity token receives HTTP 403. Use an authenticated local Cloud Run proxy to inspect a private UI, as described in [Google's developer authentication guide](https://docs.cloud.google.com/run/docs/authenticating/developers):

```bash
gcloud run services proxy hcm-web --project=empflowyee-dev --region=asia-south1 --port=8080
```

Then open `http://localhost:8080`. The CLI requires its `cloud-run-proxy` component. This Windows machine also has a standalone proxy 0.5.1 downloaded from Google's SDK component distribution and verified against its published SHA-256:

```powershell
& "$env:LOCALAPPDATA\Programs\GoogleCloudRunProxy\0.5.1\bin\cloud-run-proxy.exe" `
  -host https://hcm-web-bf3q2l4gtq-el.a.run.app -bind 127.0.0.1:8080
```

Use the corresponding service URL and a different loopback port for each additional proxy. It uses the operator's existing Google login; no token belongs in Git or a URL. No preview proxy was started during this task; live verification used authenticated direct HTTP requests.

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

Return to HCM Shell and Theme Lab work using the approved HCM architecture and UI specifications. Public access, production edge routing, browser/API authentication, secrets and databases require their separate designs; they are not prerequisites for verifying these private scaffold services.
