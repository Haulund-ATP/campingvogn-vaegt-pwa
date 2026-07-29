#Requires -Version 7.0
<#
.SYNOPSIS
  Opretter eller genbruger Microsoft Entra-appregistreringen for runtime-API'et og sætter
  client secret direkte som Azure Static Web Apps application setting.

.DESCRIPTION
  Runtime-identiteten får IKKE Sites.ReadWrite.All. Den får Sites.Selected (application permission),
  og selve adgangen til det konkrete site tildeles separat med configure-selected-permissions.ps1.
  Secretet udskrives, gemmes eller committes aldrig — det sættes direkte i Azure.
#>
param(
    [Parameter(Mandatory = $true)] [string]$StaticWebAppName,
    [Parameter(Mandatory = $true)] [string]$ResourceGroup,
    [string]$AppDisplayName = "campingvogn-vaegt-pwa-runtime",
    [int]$SecretValidityMonths = 12
)

$ErrorActionPreference = "Stop"

$existing = az ad app list --display-name $AppDisplayName --query "[0]" | ConvertFrom-Json

if ($existing) {
    Write-Host "Genbruger eksisterende appregistrering '$AppDisplayName' ($($existing.appId))." -ForegroundColor Yellow
    $appId = $existing.appId
    $objectId = $existing.id
} else {
    Write-Host "Opretter ny appregistrering '$AppDisplayName'..."
    $created = az ad app create --display-name $AppDisplayName --sign-in-audience AzureADMyOrg | ConvertFrom-Json
    $appId = $created.appId
    $objectId = $created.id
    Write-Host "Oprettet: $appId" -ForegroundColor Green

    Write-Host "Opretter service principal..."
    az ad sp create --id $appId | Out-Null
}

# Microsoft Graph application permission: Sites.Selected
$graphResourceAppId = "00000003-0000-0000-c000-000000000000"
$sitesSelectedPermissionId = "883ea226-0bf2-4a8f-9f9d-92c9162a727d" # Sites.Selected (Application)

Write-Host "Tildeler Microsoft Graph application permission Sites.Selected..."
$requiredResourceAccess = @(
    @{
        resourceAppId  = $graphResourceAppId
        resourceAccess = @(@{ id = $sitesSelectedPermissionId; type = "Role" })
    }
)
az ad app update --id $appId --required-resource-access ($requiredResourceAccess | ConvertTo-Json -Depth 10) | Out-Null

Write-Host "`nAdmin consent kræves for Sites.Selected. Dette kræver rollen 'Global Administrator' eller 'Privileged Role Administrator'." -ForegroundColor Yellow
try {
    $graphSpId = (az ad sp list --filter "appId eq '$graphResourceAppId'" --query "[0].id" -o tsv)
    $appSpId = (az ad sp list --filter "appId eq '$appId'" --query "[0].id" -o tsv)
    az ad app permission admin-consent --id $appId 2>$null
    Write-Host "Admin consent tildelt." -ForegroundColor Green
} catch {
    Write-Warning "Admin consent kunne ikke tildeles automatisk. Giv samtykke manuelt i Entra-portalen under App registrations > $AppDisplayName > API permissions > Grant admin consent."
}

Write-Host "`nOpretter nyt client secret (udløber om $SecretValidityMonths måneder)..."
$secretResult = az ad app credential reset --id $appId --display-name "runtime-secret" --years 0 --end-date (Get-Date).AddMonths($SecretValidityMonths).ToString("yyyy-MM-dd") | ConvertFrom-Json
$clientSecret = $secretResult.password

if (-not $clientSecret) {
    throw "Kunne ikke oprette client secret."
}

Write-Host "Sætter CLIENT_SECRET og CLIENT_ID direkte som Azure Static Web Apps application settings (udskrives ikke)..."
az staticwebapp appsettings set `
    --name $StaticWebAppName `
    --resource-group $ResourceGroup `
    --setting-names "CLIENT_ID=$appId" "CLIENT_SECRET=$clientSecret" | Out-Null

Write-Host "`nFærdig." -ForegroundColor Green
Write-Host "  App-navn:     $AppDisplayName"
Write-Host "  Client ID:    $appId"
Write-Host "  Object ID:    $objectId"
Write-Host "  Secret udløb: $((Get-Date).AddMonths($SecretValidityMonths).ToString('yyyy-MM-dd'))"
Write-Host "`nKør dernæst scripts/configure-selected-permissions.ps1 for at give appen adgang til det konkrete SharePoint-site."
