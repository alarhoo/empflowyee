output "name" {
  value = google_cloud_run_v2_service.this.name
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}

output "location" {
  value = google_cloud_run_v2_service.this.location
}

output "runtime_service_account" {
  value = var.runtime_service_account
}

output "public_access_enabled" {
  description = "Whether Cloud Run accepts requests without an IAM identity token."
  value       = google_cloud_run_v2_service.this.invoker_iam_disabled
}
