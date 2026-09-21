#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/foundation.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy foundation.env.example to foundation.env and set BILLING_ACCOUNT_ID." >&2
  exit 1
fi

# shellcheck disable=SC1090
source <(tr -d '\r' < "$ENV_FILE")

: "${BILLING_ACCOUNT_ID:?BILLING_ACCOUNT_ID is required}"
[[ "$BILLING_ACCOUNT_ID" =~ ^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$ && "$BILLING_ACCOUNT_ID" != 000000-111111-222222 ]] || {
  echo 'Set a real BILLING_ACCOUNT_ID.' >&2; exit 1;
}
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

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

# Preflight existing projects before any folder/project mutation.
for project in "$DEV_PROJECT_ID" "$QA_PROJECT_ID" "$PROD_PROJECT_ID"; do
  project_org="$(gcloud projects get-ancestors "$project" --filter='type=organization' --format='value(id)')"
  [[ "$project_org" == "$ORG_ID" ]] || { echo "$project is outside organization $ORG_ID" >&2; exit 1; }
done
EXISTING_CICD="$(gcloud projects list --filter="projectId=$CICD_PROJECT_ID" --format='value(projectId)')"
if [[ -n "$EXISTING_CICD" ]]; then
  project_org="$(gcloud projects get-ancestors "$CICD_PROJECT_ID" --filter='type=organization' --format='value(id)')"
  [[ "$project_org" == "$ORG_ID" ]] || { echo 'CICD project is outside the approved organization' >&2; exit 1; }
fi
billing_open="$(gcloud billing accounts describe "$BILLING_ACCOUNT_ID" --format='value(open)')"
[[ "${billing_open,,}" == true ]] || { echo 'Billing account must be open.' >&2; exit 1; }

echo "Active gcloud account: ${ACTIVE_ACCOUNT}"
echo "Organization: ${ORG_ID}"
echo "Region: ${REGION}"
echo "Projects: ${CICD_PROJECT_ID}, ${DEV_PROJECT_ID}, ${QA_PROJECT_ID}, ${PROD_PROJECT_ID}"
echo "This bootstrap may move existing DEV/QA/PROD projects into new folders, changing inherited IAM/org-policy scope."

if [[ "${BOOTSTRAP_CONFIRM:-NO}" != "YES" ]]; then
  read -r -p "Type YES to continue: " answer
  if [[ "${answer}" != "YES" ]]; then
    echo "Cancelled. No bootstrap changes were requested."
    exit 0
  fi
fi

folder_id_under_org() {
  local name="$1"
  gcloud resource-manager folders list \
    --organization="${ORG_ID}" \
    --filter="displayName=${name} AND lifecycleState=ACTIVE" \
    --format='value(name)' | sed 's#folders/##'
}

folder_id_under_folder() {
  local parent="$1"
  local name="$2"
  gcloud resource-manager folders list \
    --folder="${parent}" \
    --filter="displayName=${name} AND lifecycleState=ACTIVE" \
    --format='value(name)' | sed 's#folders/##'
}

ensure_folder_org() {
  local name="$1"
  local id
  id="$(folder_id_under_org "${name}")"
  [[ "$id" != *$'\n'* ]] || { echo "Ambiguous folder: $name" >&2; return 1; }
  if [[ -z "${id}" ]]; then
    id="$(gcloud resource-manager folders create --display-name="${name}" --organization="${ORG_ID}" --format='value(name)' | sed 's#folders/##')"
  fi
  echo "${id}"
}

ensure_folder_child() {
  local parent="$1"
  local name="$2"
  local id
  id="$(folder_id_under_folder "${parent}" "${name}")"
  [[ "$id" != *$'\n'* ]] || { echo "Ambiguous folder: $name" >&2; return 1; }
  if [[ -z "${id}" ]]; then
    id="$(gcloud resource-manager folders create --display-name="${name}" --folder="${parent}" --format='value(name)' | sed 's#folders/##')"
  fi
  echo "${id}"
}

ROOT_FOLDER_ID="$(ensure_folder_org empflowyee)"
SHARED_FOLDER_ID="$(ensure_folder_child "${ROOT_FOLDER_ID}" shared)"
NONPROD_FOLDER_ID="$(ensure_folder_child "${ROOT_FOLDER_ID}" nonprod)"
PROD_FOLDER_ID="$(ensure_folder_child "${ROOT_FOLDER_ID}" prod)"

echo "empflowyee folder: ${ROOT_FOLDER_ID}"
echo "shared folder: ${SHARED_FOLDER_ID}"
echo "nonprod folder: ${NONPROD_FOLDER_ID}"
echo "prod folder: ${PROD_FOLDER_ID}"

if [[ -z "$EXISTING_CICD" ]]; then
  gcloud projects create "${CICD_PROJECT_ID}" --name="empFLOWyee CI/CD" --folder="${SHARED_FOLDER_ID}"
else
  CURRENT_PARENT="$(gcloud projects describe "${CICD_PROJECT_ID}" --format='value(parent.id)')"
  if [[ "${CURRENT_PARENT}" != "${SHARED_FOLDER_ID}" ]]; then
    gcloud beta projects move "${CICD_PROJECT_ID}" --folder="${SHARED_FOLDER_ID}" --quiet
  fi
fi

gcloud billing projects link "${CICD_PROJECT_ID}" --billing-account="${BILLING_ACCOUNT_ID}"

move_project_if_needed() {
  local project_id="$1"
  local target_folder="$2"
  if ! gcloud projects describe "${project_id}" >/dev/null 2>&1; then
    echo "Expected existing project ${project_id} was not found." >&2
    exit 1
  fi
  local current_parent
  current_parent="$(gcloud projects describe "${project_id}" --format='value(parent.id)')"
  if [[ "${current_parent}" != "${target_folder}" ]]; then
    echo "Moving ${project_id} into folder ${target_folder}..."
    gcloud beta projects move "${project_id}" --folder="${target_folder}" --quiet
  else
    echo "${project_id} already has the expected parent."
  fi
}

move_project_if_needed "${DEV_PROJECT_ID}" "${NONPROD_FOLDER_ID}"
move_project_if_needed "${QA_PROJECT_ID}" "${NONPROD_FOLDER_ID}"
move_project_if_needed "${PROD_PROJECT_ID}" "${PROD_FOLDER_ID}"

for project in "${DEV_PROJECT_ID}" "${QA_PROJECT_ID}" "${PROD_PROJECT_ID}"; do
  gcloud billing projects link "${project}" --billing-account="${BILLING_ACCOUNT_ID}" >/dev/null
  # Terraform needs Service Usage/Resource Manager available before it can
  # manage the rest of the project's API surface.
  gcloud services enable \
    cloudresourcemanager.googleapis.com \
    serviceusage.googleapis.com \
    --project="${project}" >/dev/null
  echo "Billing and Terraform bootstrap APIs verified for ${project}."
done

gcloud services enable \
  cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  --project="${CICD_PROJECT_ID}"

existing_bucket="$(gcloud storage buckets list --project="$CICD_PROJECT_ID" --filter="name=$TF_STATE_BUCKET" --format='value(name)')"
if [[ -z "$existing_bucket" ]]; then
  gcloud storage buckets create "gs://${TF_STATE_BUCKET}" \
    --project="${CICD_PROJECT_ID}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

project_number="$(gcloud projects describe "$CICD_PROJECT_ID" --format='value(projectNumber)')"
bucket_project="$(gcloud storage buckets describe "gs://$TF_STATE_BUCKET" --raw --format='value(projectNumber)')"
bucket_location="$(gcloud storage buckets describe "gs://$TF_STATE_BUCKET" --raw --format='value(location)')"
[[ "$bucket_project" == "$project_number" && "${bucket_location,,}" == "$REGION" ]] || {
  echo 'State bucket has the wrong project or location. No bucket settings were changed.' >&2; exit 1;
}
gcloud storage buckets update "gs://${TF_STATE_BUCKET}" --uniform-bucket-level-access --public-access-prevention --versioning

echo
echo "GCP Stage 0 bootstrap complete."
echo "Terraform state bucket: gs://${TF_STATE_BUCKET}"
echo "Next: configure infra/terraform/shared/backend.hcl and terraform.tfvars, then terraform init/plan/apply."
