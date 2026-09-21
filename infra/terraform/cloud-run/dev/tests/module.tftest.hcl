# Exercise the reusable module's access and health guards with plan-only mock resources.
mock_provider "google" {}

variables {
  project_id              = "empflowyee-dev"
  region                  = "asia-south1"
  service_name            = "hcm-api"
  runtime_service_account = "hcm-api@empflowyee-dev.iam.gserviceaccount.com"
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

run "reject_public_api_invocation" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables { allow_unauthenticated = true }
  expect_failures = [var.allow_unauthenticated]
}

run "allow_approved_dev_web_invocation" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables {
    service_name            = "hcm-web"
    runtime_service_account = "hcm-web@empflowyee-dev.iam.gserviceaccount.com"
    allow_unauthenticated   = true
  }
  assert {
    condition     = google_cloud_run_v2_service.this.invoker_iam_disabled
    error_message = "The approved DEV web surface must accept ordinary browser requests."
  }
}

run "reject_public_qa_web_invocation" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables {
    project_id              = "empflowyee-qa"
    service_name            = "hcm-web"
    runtime_service_account = "hcm-web@empflowyee-qa.iam.gserviceaccount.com"
    allow_unauthenticated   = true
  }
  expect_failures = [var.allow_unauthenticated]
}

run "reject_public_prod_web_invocation" {
  command = plan
  module { source = "../../modules/cloud-run-service" }
  variables {
    project_id              = "empflowyee-prd"
    service_name            = "hcm-web"
    runtime_service_account = "hcm-web@empflowyee-prd.iam.gserviceaccount.com"
    allow_unauthenticated   = true
  }
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
