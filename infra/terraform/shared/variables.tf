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

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/repository form, for example manju/empflowyee."
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use the intended GitHub owner/repository name."
  }
}

variable "wif_pool_id" {
  type    = string
  default = "github-actions"
}

variable "wif_provider_id" {
  type    = string
  default = "github"
}

variable "github_repository_id" {
  type        = string
  description = "Immutable numeric GitHub repository ID."
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_id))
    error_message = "Supply the repository's numeric GitHub ID."
  }
}

variable "github_owner_id" {
  type        = string
  description = "Immutable numeric GitHub repository owner ID."
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_owner_id))
    error_message = "Supply the repository owner's numeric GitHub ID."
  }
}
