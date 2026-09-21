mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789012" }
  }
}

variables {
  github_repository    = "example/empflowyee"
  github_repository_id = "123456789"
  github_owner_id      = "987654321"
}

run "immutable_artifacts_and_scoped_builder" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.apps.docker_config[0].immutable_tags
    error_message = "Release tags must not be replaceable."
  }
  assert {
    condition     = endswith(google_service_account_iam_member.github_builder_wif.member, "/attribute.delivery_environment/123456789:cicd")
    error_message = "Builder impersonation must be limited to the CICD environment."
  }
  assert {
    condition     = google_iam_workload_identity_pool_provider.github.attribute_mapping["attribute.delivery_environment"] == "assertion.repository_id + ':' + assertion.environment"
    error_message = "WIF bindings must distinguish the repository and environment."
  }
}

run "reject_non_numeric_repository_id" {
  command = plan
  variables { github_repository_id = "owner/name" }
  expect_failures = [var.github_repository_id]
}
