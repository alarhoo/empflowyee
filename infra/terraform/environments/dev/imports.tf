# Adopt the deployer already present in DEV before the first foundation apply.
# The declarative import is a no-op once this resource belongs to this state.
import {
  to = google_service_account.github_deployer
  id = "projects/empflowyee-dev/serviceAccounts/github-deployer@empflowyee-dev.iam.gserviceaccount.com"
}
