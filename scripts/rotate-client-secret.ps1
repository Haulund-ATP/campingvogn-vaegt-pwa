#Requires -Version 7.0
<#
.SYNOPSIS
  Roterer runtime-appregistreringens Microsoft Graph client secret og opdaterer Azure Static Web Apps.
#>
param(
    [Parameter(Mandatory = $true)] [string]$StaticWebAppName,
    [Parameter(Mandatory = $true)] [string]$ResourceGroup,
    [string]$AppDisplayName = "campingvogn-vaegt-pwa-runtime",
    [int]$SecretValidityMonths = 12
)

$ErrorActionPreference = "Stop"

$app = az ad app list --display-name $AppDisplayName --query "[0]" | ConvertFrom-Json
if (-not $app) { throw "Fandt ikke appregistreringen '$AppDisplayName'." }

Write-Host "Opretter nyt client secret for '$AppDisplayName'..."
$secretResult = az ad app credential reset --id $app.appId --display-name "runtime-secret-$(Get-Date -Format 'yyyyMMdd')" --years 0 --end-date (Get-Date).AddMonths($SecretValidityMonths).ToString("yyyy-MM-dd") --append | ConvertFrom-Json
$newSecret = $secretResult.password

az staticwebapp appsettings set --name $StaticWebAppName --resource-group $ResourceGroup --setting-names "CLIENT_SECRET=$newSecret" | Out-Null

Write-Host "Nyt client secret er sat direkte i Azure Static Web Apps (ikke udskrevet)." -ForegroundColor Green
Write-Host "Husk at fjerne det gamle secret manuelt i Entra-portalen, når du har bekræftet at API'et fungerer med det nye."
