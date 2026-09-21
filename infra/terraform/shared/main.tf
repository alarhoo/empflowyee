locals {
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "serviceusage.googleapis.com",
    "sts.googleapis.com",
  ])
}

data "google_project" "cicd" {
  project_id = var.cicd_project_id
}

resource "google_project_service" "required" {
  for_each = local.required_apis

  project            = var.cicd_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "apps" {
  project       = var.cicd_project_id
  location      = var.region
  repository_id = var.artifact_repository
  description   = "Immutable empFLOWyee application container images"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }
  lifecycle {
    prevent_destroy = true
  }
  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.cicd_project_id
  workload_identity_pool_id = var.wif_pool_id
  display_name              = "GitHub Actions"
  description               = "GitHub OIDC identities for empFLOWyee CI/CD"

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.cicd_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.wif_provider_id
  display_name                       = "empFLOWyee GitHub"

  attribute_mapping = {
    "google.subject"                 = "assertion.sub"
    "attribute.repository_id"        = "assertion.repository_id"
    "attribute.delivery_environment" = "assertion.repository_id + ':' + assertion.environment"
  }

  # Numeric IDs prevent repository-name reuse from inheriting trust. The
  # environment/workflow pair keeps builder and deployment identities separate.
  attribute_condition = join(" && ", [
    "assertion.repository == '${var.github_repository}'",
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
    "((assertion.environment == 'cicd' && assertion.job_workflow_ref == '${var.github_repository}/.github/workflows/_reusable-build-image.yml@refs/heads/main' && assertion.event_name in ['push', 'workflow_dispatch']) || (assertion.environment in ['dev', 'qa', 'prod'] && assertion.job_workflow_ref == '${var.github_repository}/.github/workflows/_reusable-deploy-cloud-run.yml@refs/heads/main' && assertion.event_name == 'workflow_dispatch'))",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_builder" {
  project      = var.cicd_project_id
  account_id   = "github-builder"
  display_name = "GitHub container builder"
  description  = "Writes build-once application images to Artifact Registry."
  depends_on   = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "builder_writer" {
  project    = var.cicd_project_id
  location   = google_artifact_registry_repository.apps.location
  repository = google_artifact_registry_repository.apps.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_builder.email}"
}

resource "google_service_account_iam_member" "github_builder_wif" {
  service_account_id = google_service_account.github_builder.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${data.google_project.cicd.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/attribute.delivery_environment/${var.github_repository_id}:cicd"
}
