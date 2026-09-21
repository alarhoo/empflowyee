$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) { $PSNativeCommandUseErrorActionPreference = $true }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir "foundation.env"

if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile. Copy foundation.env.example to foundation.env and set BILLING_ACCOUNT_ID."
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
}

$BillingAccountId = $env:BILLING_ACCOUNT_ID
if ($BillingAccountId -notmatch '^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$' -or $BillingAccountId -eq '000000-111111-222222') { throw "Set a real BILLING_ACCOUNT_ID." }

$OrgId = if ($env:ORG_ID) { $env:ORG_ID } else { "242771450903" }
$Region = if ($env:REGION) { $env:REGION } else { "asia-south1" }
$CicdProject = if ($env:CICD_PROJECT_ID) { $env:CICD_PROJECT_ID } else { "empflowyee-cicd" }
$DevProject = if ($env:DEV_PROJECT_ID) { $env:DEV_PROJECT_ID } else { "empflowyee-dev" }
$QaProject = if ($env:QA_PROJECT_ID) { $env:QA_PROJECT_ID } else { "empflowyee-qa" }
$ProdProject = if ($env:PROD_PROJECT_ID) { $env:PROD_PROJECT_ID } else { "empflowyee-prd" }
$StateBucket = if ($env:TF_STATE_BUCKET) { $env:TF_STATE_BUCKET } else { "empflowyee-tfstate-$OrgId" }

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw "gcloud is required." }

$GcloudCommand = (Get-Command gcloud -ErrorAction Stop).Source
function Invoke-Gcloud {
    & $GcloudCommand @args
    if ($LASTEXITCODE -ne 0) { throw "gcloud failed with exit code $LASTEXITCODE. Bootstrap stopped." }
}

# Validate all existing projects before creating folders or moving anything.
foreach ($ProjectId in @($DevProject, $QaProject, $ProdProject)) {
    $ProjectOrg = Invoke-Gcloud projects get-ancestors $ProjectId --filter="type=organization" --format="value(id)"
    if ($ProjectOrg -ne $OrgId) { throw "$ProjectId is not in the approved organization $OrgId." }
}
$ExistingCicd = Invoke-Gcloud projects list --filter="projectId=$CicdProject" --format="value(projectId)"
if ($ExistingCicd) {
    $ProjectOrg = Invoke-Gcloud projects get-ancestors $CicdProject --filter="type=organization" --format="value(id)"
    if ($ProjectOrg -ne $OrgId) { throw "$CicdProject is not in the approved organization $OrgId." }
}
$BillingOpen = Invoke-Gcloud billing accounts describe $BillingAccountId --format="value(open)"
if ($BillingOpen -ne 'True') { throw 'Billing account must be open.' }

Write-Host "Organization: $OrgId"
Write-Host "Region: $Region"
Write-Host "Projects: $CicdProject, $DevProject, $QaProject, $ProdProject"
Write-Warning "This bootstrap may move existing DEV/QA/PROD projects into new folders, changing inherited IAM/org-policy scope."
if ($env:BOOTSTRAP_CONFIRM -ne "YES") {
    $answer = Read-Host "Type YES to continue"
    if ($answer -ne "YES") { Write-Host "Cancelled."; exit 0 }
}

function Get-OrCreateFolderUnderOrg([string]$Name) {
    $id = Invoke-Gcloud resource-manager folders list --organization=$OrgId --filter="displayName=$Name AND lifecycleState=ACTIVE" --format="value(name)"
    if (@($id).Count -gt 1) { throw "Ambiguous folder: $Name" }
    if (-not $id) {
        $id = Invoke-Gcloud resource-manager folders create --display-name=$Name --organization=$OrgId --format="value(name)"
    }
    return ($id -replace '^folders/', '')
}

function Get-OrCreateFolderUnderFolder([string]$Parent, [string]$Name) {
    $id = Invoke-Gcloud resource-manager folders list --folder=$Parent --filter="displayName=$Name AND lifecycleState=ACTIVE" --format="value(name)"
    if (@($id).Count -gt 1) { throw "Ambiguous folder: $Name" }
    if (-not $id) {
        $id = Invoke-Gcloud resource-manager folders create --display-name=$Name --folder=$Parent --format="value(name)"
    }
    return ($id -replace '^folders/', '')
}

$RootFolder = Get-OrCreateFolderUnderOrg "empflowyee"
$SharedFolder = Get-OrCreateFolderUnderFolder $RootFolder "shared"
$NonprodFolder = Get-OrCreateFolderUnderFolder $RootFolder "nonprod"
$ProdFolder = Get-OrCreateFolderUnderFolder $RootFolder "prod"

if (-not $ExistingCicd) {
    Invoke-Gcloud projects create $CicdProject --name="empFLOWyee CI/CD" --folder=$SharedFolder | Out-Null
}

$CicdParent = Invoke-Gcloud projects describe $CicdProject --format="value(parent.id)"
if ($CicdParent -ne $SharedFolder) { Invoke-Gcloud beta projects move $CicdProject --folder=$SharedFolder --quiet }
Invoke-Gcloud billing projects link $CicdProject --billing-account=$BillingAccountId | Out-Null

function Move-Project([string]$ProjectId, [string]$FolderId) {
    Invoke-Gcloud projects describe $ProjectId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Project $ProjectId was not found." }
    $parent = Invoke-Gcloud projects describe $ProjectId --format="value(parent.id)"
    if ($parent -ne $FolderId) {
        Invoke-Gcloud beta projects move $ProjectId --folder=$FolderId --quiet
        if ($LASTEXITCODE -ne 0) { throw "Failed to move $ProjectId." }
    }
    Invoke-Gcloud billing projects link $ProjectId --billing-account=$BillingAccountId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to link billing for $ProjectId." }
    Invoke-Gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project=$ProjectId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to enable Terraform bootstrap APIs for $ProjectId." }
}

Move-Project $DevProject $NonprodFolder
Move-Project $QaProject $NonprodFolder
Move-Project $ProdProject $ProdFolder

Invoke-Gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com storage.googleapis.com --project=$CicdProject | Out-Null

$exists = Invoke-Gcloud storage buckets list --project=$CicdProject --filter="name=$StateBucket" --format="value(name)"
if (-not $exists) {
    Invoke-Gcloud storage buckets create "gs://$StateBucket" --project=$CicdProject --location=$Region --uniform-bucket-level-access --public-access-prevention | Out-Null
}
$ProjectNumber = Invoke-Gcloud projects describe $CicdProject --format="value(projectNumber)"
$Bucket = Invoke-Gcloud storage buckets describe "gs://$StateBucket" --raw --format=json | ConvertFrom-Json
if ([string]$Bucket.projectNumber -ne [string]$ProjectNumber -or $Bucket.location.ToLowerInvariant() -ne $Region) {
    throw 'State bucket has the wrong project or location. No bucket settings were changed.'
}
Invoke-Gcloud storage buckets update "gs://$StateBucket" --uniform-bucket-level-access --public-access-prevention --versioning | Out-Null

Write-Host "GCP Stage 0 bootstrap complete."
Write-Host "Terraform state bucket: gs://$StateBucket"
