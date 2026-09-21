provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

provider "google" {
  alias   = "cicd"
  project = var.cicd_project_id
  region  = var.region
}
