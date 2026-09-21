#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/foundation.env"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source <(tr -d '\r' < "$ENV_FILE")

: "${BILLING_ACCOUNT_ID:?BILLING_ACCOUNT_ID is required}"
: "${ORG_ID:=242771450903}"
: "${REGION:=asia-south1}"
: "${CICD_PROJECT_ID:=empflowyee-cicd}"
: "${DEV_PROJECT_ID:=empflowyee-dev}"
: "${QA_PROJECT_ID:=empflowyee-qa}"
: "${PROD_PROJECT_ID:=empflowyee-prd}"
: "${TF_STATE_BUCKET:=empflowyee-tfstate-${ORG_ID}}"

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required." >&2; exit 1; }

# gcloud on Windows can emit CRLF; preserve its exit status through pipefail.
gcloud() { command gcloud "$@" | tr -d '\r'; }

# Compare $1 and $2 without case sensitivity; exit with diagnostic $3 on mismatch.
require_equal() {
  [[ "${1,,}" == "${2,,}" ]] || { echo "Verification failed: $3" >&2; exit 1; }
}
# Resolve folder name $2 beneath the parent selector $1; reject missing or duplicate matches.
folder() {
  local parent="$1" name="$2" value
  value="$(gcloud resource-manager folders list "$parent" --filter="displayName=$name AND lifecycleState=ACTIVE" --format='value(name)')"
  [[ -n "$value" && "$value" != *$'\n'* ]] || { echo "Missing or ambiguous folder: $name" >&2; return 1; }
  printf '%s' "${value#folders/}"
}
root="$(folder "--organization=$ORG_ID" empflowyee)"
shared="$(folder "--folder=$root" shared)"
nonprod="$(folder "--folder=$root" nonprod)"
prod="$(folder "--folder=$root" prod)"

for project in "$CICD_PROJECT_ID" "$DEV_PROJECT_ID" "$QA_PROJECT_ID" "$PROD_PROJECT_ID"; do
  expected_parent="$nonprod"
  if [[ "$project" == "$CICD_PROJECT_ID" ]]; then expected_parent="$shared"; fi
  if [[ "$project" == "$PROD_PROJECT_ID" ]]; then expected_parent="$prod"; fi
  actual_parent="$(gcloud projects describe "$project" --format='value(parent.id)')"
  require_equal "$actual_parent" "$expected_parent" "$project parent folder"
  state="$(gcloud projects describe "$project" --format='value(lifecycleState)')"
  require_equal "$state" ACTIVE "$project lifecycle"
  billing="$(gcloud billing projects describe "$project" --format='value(billingAccountName)')"
  require_equal "$billing" "billingAccounts/$BILLING_ACCOUNT_ID" "$project billing account"
  enabled="$(gcloud billing projects describe "$project" --format='value(billingEnabled)')"
  require_equal "$enabled" true "$project billing enabled"
  apis="$(gcloud services list --enabled --project="$project" --format='value(config.name)')"
  for api in cloudresourcemanager.googleapis.com serviceusage.googleapis.com; do
    grep -qx "$api" <<<"$apis" || { echo "Missing $api on $project" >&2; exit 1; }
  done
  if [[ "$project" == "$CICD_PROJECT_ID" ]]; then
    grep -qx storage.googleapis.com <<<"$apis" || { echo 'Missing state storage API' >&2; exit 1; }
  fi
  echo "Verified project hierarchy, billing and bootstrap APIs: $project"
done

# Print metadata field $1 from the configured Terraform state bucket without changing it.
bucket_value() {
  gcloud storage buckets describe "gs://$TF_STATE_BUCKET" --raw "--format=value($1)"
}
project_number="$(gcloud projects describe "$CICD_PROJECT_ID" --format='value(projectNumber)')"
require_equal "$(bucket_value projectNumber)" "$project_number" 'state bucket ownership'
require_equal "$(bucket_value location)" "$REGION" 'state bucket region'
require_equal "$(bucket_value iamConfiguration.uniformBucketLevelAccess.enabled)" true 'uniform access'
require_equal "$(bucket_value iamConfiguration.publicAccessPrevention)" enforced 'public access prevention'
require_equal "$(bucket_value versioning.enabled)" true 'state versioning'
echo "Verified protected state bucket: gs://$TF_STATE_BUCKET"
