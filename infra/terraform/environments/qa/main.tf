locals {
  required_apis = toset([
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
  ])

  deployables = toset([
    "marketing-web",
    "account-web",
    "account-api",
    "hcm-web",
    "hcm-api",
    "console-web",
    "console-api",
  ])
}

data "google_project" "current" {
  project_id = var.project_id
}

data "google_project" "cicd" {
  provider   = google.cicd
  project_id = var.cicd_project_id
}

resource "google_project_service" "required" {
  for_each = local.required_apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# Materialize the Google-managed Cloud Run service agent so cross-project
# Artifact Registry access can be granted deterministically.
resource "google_project_service_identity" "cloud_run" {
  provider = google-beta
  project  = var.project_id
  service  = "run.googleapis.com"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "github_deployer" {
  project      = var.project_id
  account_id   = "github-deployer"
  display_name = "GitHub ${upper(var.environment)} deployer"
  description  = "Deploys pre-built immutable images to Cloud Run in ${var.environment}."
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  for_each = local.deployables

  project      = var.project_id
  account_id   = substr(replace(each.value, "_", "-"), 0, 30)
  display_name = "${each.value} runtime"
  description  = "Runtime identity for ${each.value}. No broad roles are granted here."
  depends_on   = [google_project_service.required]
}

resource "google_project_iam_member" "deployer_cloud_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_service_account_iam_member" "deployer_can_act_as_runtime" {
  for_each = google_service_account.runtime

  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_service_account_iam_member" "github_wif_can_impersonate_deployer" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${data.google_project.cicd.number}/locations/global/workloadIdentityPools/${var.wif_pool_id}/attribute.delivery_environment/${var.github_repository_id}:${var.environment}"
}

# The deployment principal needs to inspect/read the exact digest it promotes.
resource "google_artifact_registry_repository_iam_member" "deployer_reader" {
  provider = google.cicd

  project    = var.cicd_project_id
  location   = var.region
  repository = var.artifact_repository
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.github_deployer.email}"
}

# Cloud Run's Google-managed service agent imports the image from the central
# Artifact Registry repository when creating a revision in another project.
resource "google_artifact_registry_repository_iam_member" "cloud_run_service_agent_reader" {
  provider = google.cicd

  project    = var.cicd_project_id
  location   = var.region
  repository = var.artifact_repository
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_project_service_identity.cloud_run.email}"
}
