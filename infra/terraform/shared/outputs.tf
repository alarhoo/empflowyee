output "artifact_registry_repository" {
  value = "${var.region}-docker.pkg.dev/${var.cicd_project_id}/${google_artifact_registry_repository.apps.repository_id}"
}

output "github_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "github_builder_service_account" {
  value = google_service_account.github_builder.email
}

output "cicd_project_number" {
  value = data.google_project.cicd.number
}

output "github_environment_variables" {
  description = "Non-secret variables for the cicd GitHub Environment."
  value = {
    AR_PROJECT_ID              = var.cicd_project_id
    AR_REGION                  = var.region
    AR_REPOSITORY              = google_artifact_registry_repository.apps.repository_id
    CICD_WIF_PROVIDER          = google_iam_workload_identity_pool_provider.github.name
    CICD_BUILD_SERVICE_ACCOUNT = google_service_account.github_builder.email
  }
}
