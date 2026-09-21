# Plan-only tests isolate GCP and the state backend; no resource is created.
mock_provider "google" {}

override_data {
  target = data.terraform_remote_state.environment_foundation
  values = {
    outputs = {
      project_id = "empflowyee-prd"
      runtime_service_accounts = {
        "marketing-web" = "marketing-web@empflowyee-prd.iam.gserviceaccount.com"
        "account-web"   = "account-web@empflowyee-prd.iam.gserviceaccount.com"
        "account-api"   = "account-api@empflowyee-prd.iam.gserviceaccount.com"
        "hcm-web"       = "hcm-web@empflowyee-prd.iam.gserviceaccount.com"
        "hcm-api"       = "hcm-api@empflowyee-prd.iam.gserviceaccount.com"
        "console-web"   = "console-web@empflowyee-prd.iam.gserviceaccount.com"
        "console-api"   = "console-api@empflowyee-prd.iam.gserviceaccount.com"
      }
    }
  }
}

run "seven_dedicated_identities" {
  command = plan
  assert {
    condition = length(module.service) == 7 && alltrue([
      for name, service in module.service :
      service.runtime_service_account == "${name}@empflowyee-prd.iam.gserviceaccount.com"
    ])
    error_message = "Every deployable must use its own runtime identity in the owning project."
  }
}

run "reject_environment_override" {
  command = plan
  variables { environment = "other" }
  expect_failures = [var.environment]
}

run "reject_project_override" {
  command = plan
  variables { project_id = "other-project" }
  expect_failures = [var.project_id]
}

run "reject_foreign_state" {
  command = plan
  variables { foundation_state_prefix = "environments/other" }
  expect_failures = [var.foundation_state_prefix]
}

run "reject_foreign_identity" {
  command = plan
  override_data {
    target = data.terraform_remote_state.environment_foundation
    values = {
      outputs = {
        project_id = "foreign-project"
        runtime_service_accounts = {
          "marketing-web" = "marketing-web@foreign-project.iam.gserviceaccount.com"
          "account-web"   = "account-web@foreign-project.iam.gserviceaccount.com"
          "account-api"   = "account-api@foreign-project.iam.gserviceaccount.com"
          "hcm-web"       = "hcm-web@foreign-project.iam.gserviceaccount.com"
          "hcm-api"       = "hcm-api@foreign-project.iam.gserviceaccount.com"
          "console-web"   = "console-web@foreign-project.iam.gserviceaccount.com"
          "console-api"   = "console-api@foreign-project.iam.gserviceaccount.com"
        }
      }
    }
  }
  expect_failures = [data.terraform_remote_state.environment_foundation]
}


run "reject_invalid_api_configuration" {
  command = plan
  variables {
    api_base_urls = { "hcm-web" = "http://api.example.test/api" }
  }
  expect_failures = [var.api_base_urls]
}

run "reject_non_browser_api_configuration" {
  command = plan
  variables {
    api_base_urls = { "hcm-api" = "https://api.example.test/api" }
  }
  expect_failures = [var.api_base_urls]
}
