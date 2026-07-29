#Requires -Version 7.0
<#
.SYNOPSIS
  Giver runtime-appregistreringen adgang til det ene konkrete SharePoint-site via Sites.Selected —
  ALDRIG Sites.ReadWrite.All.

.EXAMPLE
  ./scripts/configure-selected-permissions.ps1 -TenantDomain "haulundaadorf.onmicrosoft.com" -SiteUrl "https://haulundaadorf.sharepoint.com/sites/cv" -RuntimeAppId "<client-id>"
#>
param(
    [Parameter(Mandatory = $true)] [string]$TenantDomain,
    [Parameter(Mandatory = $true)] [string]$SiteUrl,
    [Parameter(Mandatory = $true)] [string]$RuntimeAppId,
    [ValidateSet("read", "write")] [string]$Role = "write"
)

$ErrorActionPreference = "Stop"

Import-Module Microsoft.Graph.Authentication -ErrorAction Stop
Connect-MgGraph -Scopes "Sites.FullControl.All" -TenantId $TenantDomain -NoWelcome

$hostName = ([Uri]$SiteUrl).Host
$siteRelativePath = ([Uri]$SiteUrl).AbsolutePath.TrimStart("/")
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${hostName}:/${siteRelativePath}"
$siteId = $site.id

$existingPermissions = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions"
$alreadyGranted = $existingPermissions.value | Where-Object {
    $_.grantedToIdentities.application.id -eq $RuntimeAppId -or $_.grantedToIdentitiesV2.application.id -eq $RuntimeAppId
}

if ($alreadyGranted) {
    Write-Host "Appen har allerede adgang til sitet. Ingen ændring foretaget." -ForegroundColor Yellow
    exit 0
}

$body = @{
    roles                  = @($Role)
    grantedToIdentities     = @(
        @{
            application = @{
                id          = $RuntimeAppId
                displayName = "campingvogn-vaegt-pwa-runtime"
            }
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions" -Body $body -ContentType "application/json" | Out-Null

Write-Host "Runtime-appen har nu '$Role'-adgang til sitet $SiteUrl (kun dette site — ikke tenant-bred adgang)." -ForegroundColor Green
