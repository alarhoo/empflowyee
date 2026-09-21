mock_provider "google" {
  mock_data "google_project" { defaults = { number = "123456789012" } }
}
mock_provider "google" {
  alias = "cicd"
  mock_data "google_project" { defaults = { number = "123456789012" } }
}
mock_provider "google-beta" {}

# Simulate the already-existing deployer adopted by imports.tf without reading live IAM.
override_resource {
  target = google_service_account.github_deployer
  values = {
    name       = "projects/empflowyee-dev/serviceAccounts/github-deployer@empflowyee-dev.iam.gserviceaccount.com"
    email      = "github-deployer@empflowyee-dev.iam.gserviceaccount.com"
    account_id = "github-deployer"
    project    = "empflowyee-dev"
  }
}

variables { github_repository_id = "123456789" }

run "environment_isolation" {
  command = plan
  assert {
    condition     = endswith(google_service_account_iam_member.github_wif_can_impersonate_deployer.member, "/attribute.delivery_environment/123456789:${var.environment}")
    error_message = "A different environment must not impersonate this deployer."
  }
  assert {
    condition     = length(google_service_account.runtime) == 7 && length(google_service_account_iam_member.deployer_can_act_as_runtime) == 7
    error_message = "Each deployable needs its own runtime identity and scoped act-as grant."
  }
  assert {
    condition     = google_artifact_registry_repository_iam_member.deployer_reader.role == "roles/artifactregistry.reader"
    error_message = "Promotion must not grant artifact write access."
  }
}

run "reject_environment_override" {
  command = plan
  variables { environment = "other" }
  expect_failures = [var.environment]
}

run "reject_cross_project_override" {
  command = plan
  variables { project_id = "another-environment" }
  expect_failures = [var.project_id]
}
