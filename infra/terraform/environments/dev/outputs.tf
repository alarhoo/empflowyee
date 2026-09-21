output "project_id" {
  value = var.project_id
}

output "github_deployer_service_account" {
  value = google_service_account.github_deployer.email
}

output "runtime_service_accounts" {
  value = { for k, v in google_service_account.runtime : k => v.email }
}

output "github_environment_variables" {
  description = "Non-secret variables for this root's GitHub Environment."
  value = {
    GCP_PROJECT_ID         = var.project_id
    GCP_REGION             = var.region
    DEPLOY_WIF_PROVIDER    = "projects/${data.google_project.cicd.number}/locations/global/workloadIdentityPools/${var.wif_pool_id}/providers/${var.wif_provider_id}"
    DEPLOY_SERVICE_ACCOUNT = google_service_account.github_deployer.email
    AR_PROJECT_ID          = var.cicd_project_id
    AR_REGION              = var.region
    AR_REPOSITORY          = var.artifact_repository
  }
}
