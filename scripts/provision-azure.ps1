#Requires -Version 7.0
<#
.SYNOPSIS
  Opretter resource group og Azure Static Web App (Free) med integrerede Functions,
  og sætter de ikke-følsomme + genererede hemmelige application settings.

.DESCRIPTION
  Genererer TOKEN_HASH_PEPPER, SESSION_SIGNING_SECRET og RATE_LIMIT_PEPPER lokalt og sætter dem
  direkte i Azure — de udskrives én gang, så TOKEN_HASH_PEPPER kan genbruges i provision-sharepoint.ps1.
  Idempotent: genkørsel opdaterer ikke eksisterende peppers/secrets, kun manglende ressourcer.
#>
param(
    [string]$ResourceGroup = "rg-campingvogn-vaegt-pwa",
    [string]$Location = "westeurope",
    [string]$StaticWebAppName = "campingvogn-vaegt-pwa",
    [Parameter(Mandatory = $true)] [string]$TenantId,
    [Parameter(Mandatory = $true)] [string]$TenantDomain,
    [Parameter(Mandatory = $true)] [string]$SharePointSiteUrl,
    [string]$PublicAppUrl = "https://c.h-aa.dk"
)

$ErrorActionPreference = "Stop"

Write-Host "Kontrollerer at Azure Static Web Apps med integreret API understøttes i '$Location'..."
$supportedLocations = az provider show --namespace Microsoft.Web --query "resourceTypes[?resourceType=='staticSites'].locations | [0]" -o json | ConvertFrom-Json
if ($supportedLocations -notcontains $Location) {
    Write-Warning "Regionen '$Location' er ikke i den aktuelle liste over understøttede lokationer: $($supportedLocations -join ', ')"
    throw "Vælg en understøttet region og kør scriptet igen med -Location."
}
Write-Host "OK: '$Location' understøttes." -ForegroundColor Green

Write-Host "`nForventet driftsomkostning:"
Write-Host "  Azure Static Web Apps Free:         0 kr./måned"
Write-Host "  Integrerede managed Functions:      0 kr./måned"
Write-Host "  Managed TLS-certifikat:             0 kr./måned"
Write-Host "  Samlet forventet drift:             0 kr./måned"
Write-Host ""

$rgExists = az group exists --name $ResourceGroup | ConvertFrom-Json
if (-not $rgExists) {
    Write-Host "Opretter resource group '$ResourceGroup' i '$Location'..."
    az group create --name $ResourceGroup --location $Location | Out-Null
} else {
    Write-Host "Resource group '$ResourceGroup' findes allerede." -ForegroundColor Yellow
}

$existingSwa = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
if ($existingSwa) {
    Write-Host "Static Web App '$StaticWebAppName' findes allerede." -ForegroundColor Yellow
} else {
    Write-Host "Opretter Azure Static Web App (Free) '$StaticWebAppName'..."
    az staticwebapp create `
        --name $StaticWebAppName `
        --resource-group $ResourceGroup `
        --location $Location `
        --sku Free | Out-Null
    Write-Host "Static Web App oprettet." -ForegroundColor Green
}

$defaultHostname = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv
Write-Host "Midlertidig standard-URL (kun til test): https://$defaultHostname"

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes)
}

$existingSettings = az staticwebapp appsettings list --name $StaticWebAppName --resource-group $ResourceGroup --query "properties" | ConvertFrom-Json

$settingsToSet = @{
    TENANT_DOMAIN       = $TenantDomain
    TENANT_ID           = $TenantId
    SHAREPOINT_SITE_URL = $SharePointSiteUrl
    PUBLIC_APP_URL      = $PublicAppUrl
}

$generatedSecrets = @{}
foreach ($name in @("TOKEN_HASH_PEPPER", "SESSION_SIGNING_SECRET", "RATE_LIMIT_PEPPER")) {
    if ($existingSettings.PSObject.Properties.Name -contains $name) {
        Write-Host "$name findes allerede — bevares uændret." -ForegroundColor Yellow
    } else {
        $generatedSecrets[$name] = New-RandomSecret
        $settingsToSet[$name] = $generatedSecrets[$name]
    }
}

$settingArgs = $settingsToSet.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
az staticwebapp appsettings set --name $StaticWebAppName --resource-group $ResourceGroup --setting-names $settingArgs | Out-Null

Write-Host "`nApplication settings opdateret." -ForegroundColor Green

if ($generatedSecrets.ContainsKey("TOKEN_HASH_PEPPER")) {
    Write-Host "`n=================================================================" -ForegroundColor Green
    Write-Host " TOKEN_HASH_PEPPER (skal genbruges i provision-sharepoint.ps1, vises kun nu):" -ForegroundColor Green
    Write-Host " $($generatedSecrets['TOKEN_HASH_PEPPER'])"
    Write-Host "=================================================================" -ForegroundColor Green
}

Write-Host "`nOversigt:"
Write-Host "  Resource group:    $ResourceGroup"
Write-Host "  Location:          $Location"
Write-Host "  Static Web App:    $StaticWebAppName"
Write-Host "  Standard-URL:      https://$defaultHostname"
Write-Host "`nKør dernæst scripts/configure-entra-app.ps1 -StaticWebAppName $StaticWebAppName -ResourceGroup $ResourceGroup"
