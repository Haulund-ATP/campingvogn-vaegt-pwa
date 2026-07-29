#Requires -Version 7.0
<#
.SYNOPSIS
  Opretter en dedikeret Entra-appregistrering til GitHub Actions-deployment via OIDC —
  ingen permanent Azure-client-secret gemmes i GitHub.

.DESCRIPTION
  Federated credential begrænses til dette konkrete personlige repository, branch 'main'
  og GitHub Environment 'production'. Tildeler kun Contributor på den ene resource group.
#>
param(
    [Parameter(Mandatory = $true)] [string]$GitHubOwner,
    [string]$RepoName = "campingvogn-vaegt-pwa",
    [string]$ResourceGroup = "rg-campingvogn-vaegt-pwa",
    [string]$AppDisplayName = "campingvogn-vaegt-pwa-deploy"
)

$ErrorActionPreference = "Stop"

$existing = az ad app list --display-name $AppDisplayName --query "[0]" | ConvertFrom-Json
if ($existing) {
    Write-Host "Genbruger eksisterende deployment-app '$AppDisplayName'." -ForegroundColor Yellow
    $appId = $existing.appId
} else {
    Write-Host "Opretter deployment-app '$AppDisplayName'..."
    $created = az ad app create --display-name $AppDisplayName | ConvertFrom-Json
    $appId = $created.appId
    az ad sp create --id $appId | Out-Null
}

$subscriptionId = az account show --query id -o tsv
$tenantId = az account show --query tenantId -o tsv

Write-Host "Tildeler Contributor på resource group '$ResourceGroup'..."
$spId = az ad sp list --filter "appId eq '$appId'" --query "[0].id" -o tsv
$scope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup"
$existingRole = az role assignment list --assignee $spId --scope $scope --query "[?roleDefinitionName=='Contributor']" | ConvertFrom-Json
if ($existingRole.Count -eq 0) {
    az role assignment create --assignee-object-id $spId --assignee-principal-type ServicePrincipal --role "Contributor" --scope $scope | Out-Null
    Write-Host "Contributor tildelt." -ForegroundColor Green
} else {
    Write-Host "Contributor er allerede tildelt." -ForegroundColor Yellow
}

function Set-FederatedCredential {
    param([string]$Name, [string]$Subject)

    $existingCreds = az ad app federated-credential list --id $appId | ConvertFrom-Json
    if ($existingCreds | Where-Object { $_.name -eq $Name }) {
        Write-Host "Federated credential '$Name' findes allerede." -ForegroundColor Yellow
        return
    }

    $body = @{
        name        = $Name
        issuer      = "https://token.actions.githubusercontent.com"
        subject     = $Subject
        audiences   = @("api://AzureADTokenExchange")
    } | ConvertTo-Json

    $tempFile = New-TemporaryFile
    $body | Set-Content -Path $tempFile
    az ad app federated-credential create --id $appId --parameters "@$tempFile" | Out-Null
    Remove-Item $tempFile
    Write-Host "Federated credential '$Name' oprettet." -ForegroundColor Green
}

Set-FederatedCredential -Name "main-branch" -Subject "repo:${GitHubOwner}/${RepoName}:ref:refs/heads/main"
Set-FederatedCredential -Name "production-environment" -Subject "repo:${GitHubOwner}/${RepoName}:environment:production"

Write-Host "`nSæt følgende GitHub Environment-secrets under 'production' (repo Settings > Environments):" -ForegroundColor Cyan
Write-Host "  AZURE_CLIENT_ID       = $appId"
Write-Host "  AZURE_TENANT_ID       = $tenantId"
Write-Host "  AZURE_SUBSCRIPTION_ID = $subscriptionId"
Write-Host "  AZURE_RESOURCE_GROUP  = $ResourceGroup"
Write-Host "  AZURE_CONTAINER_APP_NAME = <navnet på din Container App>"
Write-Host "`nIngen af disse er hemmelige client secrets — selve login sker udelukkende via OIDC."
