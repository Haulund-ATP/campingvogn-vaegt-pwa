#Requires -Version 7.0
<#
.SYNOPSIS
  Giver Container Appens system-assigned Managed Identity adgang til det ene konkrete
  SharePoint-site via Sites.Selected — ALDRIG Sites.ReadWrite.All, og intet client secret.

.DESCRIPTION
  -PrincipalId er Container Appens Managed Identity object-id (fra
  `az containerapp show --query identity.principalId`). Scriptet slår selv den tilhørende
  service principal op og bruger dens appId til Graph-tildelingen.

.EXAMPLE
  ./scripts/configure-selected-permissions.ps1 -TenantDomain "haulundaadorf.onmicrosoft.com" -SiteUrl "https://haulundaadorf.sharepoint.com/sites/cv" -PrincipalId "<managed-identity-object-id>"
#>
param(
    [Parameter(Mandatory = $true)] [string]$TenantDomain,
    [Parameter(Mandatory = $true)] [string]$SiteUrl,
    [Parameter(Mandatory = $true)] [string]$PrincipalId,
    [ValidateSet("read", "write")] [string]$Role = "write"
)

$ErrorActionPreference = "Stop"

$sp = az ad sp show --id $PrincipalId | ConvertFrom-Json
$appId = $sp.appId
$displayName = $sp.displayName

# Trin 1: tildel selve Sites.Selected application permission (app role assignment) til
# identitetens service principal. Uden dette trin indeholder tokens ingen 'roles'-claim for
# Sites.Selected, og alle Graph-kald mod SharePoint-listens elementer fejler med en uklar
# 401/'spException'-fejl, uanset at site-adgangen (trin 2) er tildelt korrekt.
$graphSpId = az ad sp list --filter "appId eq '00000003-0000-0000-c000-000000000000'" --query "[0].id" -o tsv
$sitesSelectedAppRoleId = "883ea226-0bf2-4a8f-9f9d-92c9162a727d"

$existingAssignments = az rest --method GET --url "https://graph.microsoft.com/v1.0/servicePrincipals/$PrincipalId/appRoleAssignments" | ConvertFrom-Json
$alreadyAssigned = $existingAssignments.value | Where-Object { $_.appRoleId -eq $sitesSelectedAppRoleId -and $_.resourceId -eq $graphSpId }

if ($alreadyAssigned) {
    Write-Host "Sites.Selected application permission er allerede tildelt identiteten." -ForegroundColor Yellow
} else {
    Write-Host "Tildeler Sites.Selected application permission til identiteten..."
    $roleBody = @{ principalId = $PrincipalId; resourceId = $graphSpId; appRoleId = $sitesSelectedAppRoleId } | ConvertTo-Json
    az rest --method POST --url "https://graph.microsoft.com/v1.0/servicePrincipals/$PrincipalId/appRoleAssignments" --body $roleBody | Out-Null
    Write-Host "Sites.Selected tildelt." -ForegroundColor Green
}

# Trin 2: giv adgang til det konkrete site.
Import-Module Microsoft.Graph.Authentication -ErrorAction Stop
Connect-MgGraph -Scopes "Sites.FullControl.All" -TenantId $TenantDomain -NoWelcome

$hostName = ([Uri]$SiteUrl).Host
$siteRelativePath = ([Uri]$SiteUrl).AbsolutePath.TrimStart("/")
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${hostName}:/${siteRelativePath}"
$siteId = $site.id

$existingPermissions = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions"
$alreadyGranted = $existingPermissions.value | Where-Object {
    $_.grantedToIdentities.application.id -eq $appId -or $_.grantedToIdentitiesV2.application.id -eq $appId
}

if ($alreadyGranted) {
    Write-Host "Managed Identity har allerede adgang til sitet. Ingen ændring foretaget." -ForegroundColor Yellow
    exit 0
}

$body = @{
    roles              = @($Role)
    grantedToIdentities = @(
        @{
            application = @{
                id          = $appId
                displayName = $displayName
            }
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions" -Body $body -ContentType "application/json" | Out-Null

Write-Host "Managed Identity ($displayName / appId $appId) har nu '$Role'-adgang til sitet $SiteUrl (kun dette site)." -ForegroundColor Green
