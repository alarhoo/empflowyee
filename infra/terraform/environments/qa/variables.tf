variable "environment" {
  type    = string
  default = "qa"
  validation {
    condition     = var.environment == "qa"
    error_message = "This root owns only the qa environment."
  }
}

variable "project_id" {
  type    = string
  default = "empflowyee-qa"
  validation {
    condition     = var.project_id == "empflowyee-qa"
    error_message = "This root owns only the empflowyee-qa project."
  }
}

variable "cicd_project_id" {
  type    = string
  default = "empflowyee-cicd"
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "artifact_repository" {
  type    = string
  default = "apps"
}

variable "wif_pool_id" {
  type    = string
  default = "github-actions"
}

variable "github_repository_id" {
  type        = string
  description = "Immutable numeric GitHub repository ID."
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_id))
    error_message = "Supply the repository's numeric GitHub ID."
  }
}


variable "wif_provider_id" {
  type    = string
  default = "github"
}
