variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = var.environment == "dev"
    error_message = "This Cloud Run root owns only dev."
  }
}

variable "project_id" {
  type    = string
  default = "empflowyee-dev"
  validation {
    condition     = var.project_id == "empflowyee-dev"
    error_message = "This Cloud Run root owns only empflowyee-dev."
  }
}

variable "region" {
  type    = string
  default = "asia-south1"
  validation {
    condition     = var.region == "asia-south1"
    error_message = "The approved Cloud Run region is asia-south1."
  }
}

variable "foundation_state_bucket" {
  type    = string
  default = "empflowyee-tfstate-242771450903"
}

variable "foundation_state_prefix" {
  type    = string
  default = "environments/dev"
  validation {
    condition     = var.foundation_state_prefix == "environments/dev"
    error_message = "Read runtime identities only from environments/dev."
  }
}

variable "bootstrap_image" {
  type        = string
  description = "Image used only to create the initial private service shells."
  default     = "us-docker.pkg.dev/cloudrun/container/hello@sha256:be0a21e5d7036cc60741cf60ea3b68e169cc2d00f3ad256c94536f32b0a0755c"
}

variable "ingress" {
  type        = string
  description = "Temporary baseline until the external HTTPS load balancer/domain topology is implemented."
  default     = "INGRESS_TRAFFIC_ALL"
}

# Empty during hello-image bootstrap; use verified API URLs before promoting Angular images.
variable "api_base_urls" {
  type        = map(string)
  description = "Non-secret HTTPS API endpoints for the three Angular apps. This does not grant invocation access."
  default     = {}
  validation {
    condition = alltrue([for app, url in var.api_base_urls :
      contains(["account-web", "hcm-web", "console-web"], app) &&
      can(regex("^https://[a-z0-9.-]+/api$", url))
    ])
    error_message = "Use only Angular app names and HTTPS API URLs without credentials, query strings or fragments."
  }
}
