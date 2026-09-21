data "terraform_remote_state" "environment_foundation" {
  backend = "gcs"
  config = {
    bucket = var.foundation_state_bucket
    prefix = var.foundation_state_prefix
  }

  # Refuse a stale, incomplete or foreign foundation instead of assigning the wrong runtime identities.
  lifecycle {
    postcondition {
      condition = try(
        self.outputs.project_id == var.project_id &&
        toset(keys(self.outputs.runtime_service_accounts)) == toset(keys(local.catalog)) &&
        alltrue([for name in keys(local.catalog) :
          self.outputs.runtime_service_accounts[name] == "${name}@${var.project_id}.iam.gserviceaccount.com"
        ]),
        false
      )
      error_message = "Apply the matching environment foundation first; its state must contain this project's seven dedicated runtime identities."
    }
  }
}

locals {
  catalog = jsondecode(file("${path.module}/../service-catalog.json"))

  # ADR-dev-web-browser-access: serve the four browser apps directly; APIs retain IAM checks.
  public_web_services = toset(["marketing-web", "account-web", "hcm-web", "console-web"])

  max_instances = {
    "marketing-web" = 2
    "account-web"   = 2
    "account-api"   = 2
    "hcm-web"       = 2
    "hcm-api"       = 2
    "console-web"   = 2
    "console-api"   = 2
  }

  runtime_service_accounts = data.terraform_remote_state.environment_foundation.outputs.runtime_service_accounts
}

module "service" {
  for_each = local.catalog

  source = "../../modules/cloud-run-service"

  project_id              = var.project_id
  region                  = var.region
  service_name            = each.key
  description             = "empFLOWyee ${upper(var.environment)} ${each.key}"
  runtime_service_account = local.runtime_service_accounts[each.key]
  bootstrap_image         = var.bootstrap_image
  ingress                 = var.ingress
  allow_unauthenticated   = contains(local.public_web_services, each.key)
  deletion_protection     = false
  cpu                     = each.value.cpu
  memory                  = each.value.memory
  min_instances           = 0
  max_instances           = local.max_instances[each.key]
  concurrency             = each.value.concurrency
  request_timeout         = each.value.timeout

  env_vars = merge(
    {
      APP_ENVIRONMENT = var.environment
      LOG_LEVEL       = "debug"
    },
    contains(["next", "nest-node"], each.value.runtime) ? { NODE_ENV = "production" } : {},
    contains(keys(var.api_base_urls), each.key) ? { API_BASE_URL = var.api_base_urls[each.key] } : {}
  )

  startup_probe = each.value.runtime == "nest-node" ? {
    type                  = "http"
    path                  = "/health/ready"
    initial_delay_seconds = 0
    timeout_seconds       = 2
    period_seconds        = 5
    failure_threshold     = 24
    } : each.value.runtime == "angular-static" ? {
    type                  = "http"
    path                  = "/health/ready"
    initial_delay_seconds = 0
    timeout_seconds       = 1
    period_seconds        = 5
    failure_threshold     = 12
    } : {
    type                  = "http"
    path                  = "/health/ready"
    initial_delay_seconds = 0
    timeout_seconds       = 1
    period_seconds        = 5
    failure_threshold     = 24
  }

  liveness_probe = each.value.runtime == "nest-node" ? {
    type                  = "http"
    path                  = "/health/live"
    initial_delay_seconds = 0
    timeout_seconds       = 2
    period_seconds        = 10
    failure_threshold     = 3
    } : each.value.runtime == "angular-static" ? {
    type                  = "http"
    path                  = "/health/live"
    initial_delay_seconds = 0
    timeout_seconds       = 1
    period_seconds        = 10
    failure_threshold     = 3
    } : {
    type                  = "http"
    path                  = "/health/live"
    initial_delay_seconds = 0
    timeout_seconds       = 1
    period_seconds        = 10
    failure_threshold     = 3
  }

  labels = {
    application = "empflowyee"
    environment = var.environment
    deployable  = each.key
    managed-by  = "terraform"
  }
}
