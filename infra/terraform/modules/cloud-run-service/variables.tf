variable "project_id" {
  type        = string
  description = "GCP project that owns the Cloud Run service."
}

variable "region" {
  type        = string
  description = "Cloud Run region."
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name."
}

variable "description" {
  type        = string
  description = "Human-readable service description."
  default     = null
}

variable "runtime_service_account" {
  type        = string
  description = "Dedicated runtime service account email for this deployable."
}

variable "bootstrap_image" {
  type        = string
  description = "Image used only when Terraform first creates the service. Ongoing releases are deployed outside Terraform by immutable digest."
  default     = "us-docker.pkg.dev/cloudrun/container/hello@sha256:be0a21e5d7036cc60741cf60ea3b68e169cc2d00f3ad256c94536f32b0a0755c"
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.bootstrap_image))
    error_message = "Bootstrap must use an immutable image digest, not a mutable tag."
  }
}

variable "container_port" {
  type        = number
  description = "Container ingress port."
  default     = 8080
}

variable "ingress" {
  type        = string
  description = "Cloud Run ingress mode."
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "allow_unauthenticated" {
  type        = bool
  description = "Disable the Cloud Run invoker IAM check only for the approved DEV web surfaces. See ADR-dev-web-browser-access."
  default     = false
  validation {
    condition = !var.allow_unauthenticated || (
      var.project_id == "empflowyee-dev" &&
      contains(["marketing-web", "account-web", "hcm-web", "console-web"], var.service_name)
    )
    error_message = "Public invocation is approved only for the four DEV web services; APIs and other environments remain IAM-protected."
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Protect the Cloud Run service from deletion."
  default     = false
}

variable "cpu" {
  type        = string
  description = "Container CPU limit."
  default     = "1"
}

variable "memory" {
  type        = string
  description = "Container memory limit."
  default     = "512Mi"
}

variable "cpu_idle" {
  type        = bool
  description = "Allocate CPU only while processing requests where supported."
  default     = true
}

variable "startup_cpu_boost" {
  type        = bool
  description = "Temporarily boost CPU during instance startup."
  default     = true
}

variable "min_instances" {
  type        = number
  description = "Minimum revision instance count."
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum revision instance count."
  default     = 2
}

variable "concurrency" {
  type        = number
  description = "Maximum concurrent requests per instance."
  default     = 80
}

variable "request_timeout" {
  type        = string
  description = "Cloud Run request timeout, for example 60s."
  default     = "60s"
}

variable "env_vars" {
  type        = map(string)
  description = "Stable non-secret runtime environment variables owned by infrastructure configuration."
  default     = {}
}

variable "secret_env_vars" {
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  description = "Secret Manager references. The runtime service account must separately have secretAccessor permission."
  default     = {}
}

variable "startup_probe" {
  type = object({
    type                  = string
    path                  = optional(string)
    initial_delay_seconds = optional(number, 0)
    timeout_seconds       = optional(number, 1)
    period_seconds        = optional(number, 5)
    failure_threshold     = optional(number, 12)
  })
  description = "Startup probe. type must be tcp or http."
  default = {
    type = "tcp"
  }

  validation {
    condition     = contains(["tcp", "http"], var.startup_probe.type)
    error_message = "startup_probe.type must be tcp or http."
  }
}

variable "liveness_probe" {
  type = object({
    type                  = string
    path                  = optional(string)
    initial_delay_seconds = optional(number, 0)
    timeout_seconds       = optional(number, 1)
    period_seconds        = optional(number, 10)
    failure_threshold     = optional(number, 3)
  })
  description = "HTTP liveness probe; Cloud Run does not support TCP liveness checks."
  default = {
    type = "http"
    path = "/health/live"
  }

  validation {
    condition     = var.liveness_probe.type == "http"
    error_message = "liveness_probe.type must be http."
  }
}

variable "labels" {
  type        = map(string)
  description = "Cloud Run service labels."
  default     = {}
}
