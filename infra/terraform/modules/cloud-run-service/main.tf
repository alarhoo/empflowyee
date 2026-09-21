resource "google_cloud_run_v2_service" "this" {
  project             = var.project_id
  name                = var.service_name
  location            = var.region
  description         = var.description
  deletion_protection = var.deletion_protection
  ingress             = var.ingress

  # Access is private unless the root opts into the module's approved DEV web allowlist.
  invoker_iam_disabled = var.allow_unauthenticated

  labels = var.labels

  # Image-only promotion requires the service to follow the latest ready revision.
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  template {
    service_account                  = var.runtime_service_account
    timeout                          = var.request_timeout
    max_instance_request_concurrency = var.concurrency

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = var.service_name
      image = var.bootstrap_image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = var.cpu_idle
        startup_cpu_boost = var.startup_cpu_boost
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        initial_delay_seconds = var.startup_probe.initial_delay_seconds
        timeout_seconds       = var.startup_probe.timeout_seconds
        period_seconds        = var.startup_probe.period_seconds
        failure_threshold     = var.startup_probe.failure_threshold

        dynamic "tcp_socket" {
          for_each = var.startup_probe.type == "tcp" ? [1] : []
          content {
            port = var.container_port
          }
        }

        dynamic "http_get" {
          for_each = var.startup_probe.type == "http" ? [1] : []
          content {
            path = coalesce(var.startup_probe.path, "/")
            port = var.container_port
          }
        }
      }

      liveness_probe {
        initial_delay_seconds = var.liveness_probe.initial_delay_seconds
        timeout_seconds       = var.liveness_probe.timeout_seconds
        period_seconds        = var.liveness_probe.period_seconds
        failure_threshold     = var.liveness_probe.failure_threshold

        dynamic "http_get" {
          for_each = var.liveness_probe.type == "http" ? [1] : []
          content {
            path = coalesce(var.liveness_probe.path, "/")
            port = var.container_port
          }
        }
      }
    }
  }

  # Ownership split:
  # Terraform owns stable service shape; release workflows own the immutable image digest.
  # Infra apply and release deployment must share an environment-level concurrency lock.
  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
    ]
  }
}
