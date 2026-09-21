# Exercise the reusable module's access and health guards with plan-only mock resources.
mock_provider "google" {}

variables {
  project_id              = "empflowyee-prd"
  region                  = "asia-south1"
  service_name            = "hcm-api"
  runtime_service_account = "hcm-api@empflowyee-prd.iam.gserviceaccount.com"
}

run "private_latest_revision" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  assert {
    condition = (
      !google_cloud_run_v2_service.this.invoker_iam_disabled &&
      google_cloud_run_v2_service.this.template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.this.traffic[0].type == "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST" &&
      google_cloud_run_v2_service.this.traffic[0].percent == 100
    )
    error_message = "Service shells must remain private, scale to zero and follow the latest revision."
  }
}

run "reject_public_invocation" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables { allow_unauthenticated = true }
  expect_failures = [var.allow_unauthenticated]
}

run "reject_mutable_bootstrap" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables { bootstrap_image = "us-docker.pkg.dev/cloudrun/container/hello:latest" }
  expect_failures = [var.bootstrap_image]
}

run "reject_tcp_liveness" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables { liveness_probe = { type = "tcp" } }
  expect_failures = [var.liveness_probe]
}
