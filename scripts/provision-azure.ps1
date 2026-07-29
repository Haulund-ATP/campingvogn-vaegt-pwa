#Requires -Version 7.0
<#
.SYNOPSIS
  Opretter et Azure Container Apps-miljø (Consumption, scale-to-zero) og selve Container Appen
  med system-assigned Managed Identity — intet Entra client secret involveret.

.DESCRIPTION
  Forsøger EU/EØS-regioner i rækkefølge (kan overstyres med -PreferredLocations). Stopper med en
  fejl, hvis ingen af de angivne regioner accepterer ressourcen — bruger ALDRIG en region uden
  for EU/EØS som fallback. Sætter logs-destination til 'none' for at undgå en betalt Log
  Analytics-ressource. Genererer TOKEN_HASH_PEPPER, SESSION_SIGNING_SECRET og RATE_LIMIT_PEPPER
  lokalt og sætter dem direkte som Container App-secrets/env-variabler.
#>
param(
    [string]$ResourceGroup = "rg-campingvogn-vaegt-pwa",
    [string[]]$PreferredLocations = @("denmarkeast", "swedencentral", "swedensouth", "northeurope", "westeurope"),
    [string]$EnvironmentName = "cae-campingvogn-vaegt-pwa",
    [string]$ContainerAppName = "campingvogn-vaegt-pwa",
    [string]$ImageName = "ghcr.io/REPLACE_WITH_GITHUB_OWNER/campingvogn-vaegt-pwa:latest",
    [Parameter(Mandatory = $true)] [string]$SharePointSiteUrl,
    [string]$PublicAppUrl = "https://c.h-aa.dk"
)

$ErrorActionPreference = "Stop"

az extension add --name containerapp --upgrade -y 2>$null | Out-Null
az provider register --namespace Microsoft.App --wait 2>$null | Out-Null
az provider register --namespace Microsoft.OperationalInsights --wait 2>$null | Out-Null

Write-Host "Forventet driftsomkostning:"
Write-Host "  Container Apps Consumption (scale-to-zero, min=0):  0 kr. i hvile, ganske få øre/CPU-sekund ved aktiv trafik"
Write-Host "  Managed TLS-certifikat:                              0 kr."
Write-Host "  Logs destination 'none':                             0 kr. (ingen Log Analytics-ressource)"
Write-Host "  Samlet forventet drift ved normal privat brug:       ~0 kr.`n"

$rgExists = az group exists --name $ResourceGroup | ConvertFrom-Json
if (-not $rgExists) {
    Write-Host "Opretter resource group '$ResourceGroup'..."
    # Resource groupens egen 'location' er kun metadata og behøver ikke matche miljøets region.
    az group create --name $ResourceGroup --location "westeurope" | Out-Null
}

$existingEnv = az containerapp env show --name $EnvironmentName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
if ($existingEnv) {
    Write-Host "Container Apps-miljø '$EnvironmentName' findes allerede i '$($existingEnv.location)'." -ForegroundColor Yellow
    $chosenLocation = $existingEnv.location
} else {
    $chosenLocation = $null
    foreach ($location in $PreferredLocations) {
        Write-Host "Forsøger region '$location'..."
        $result = az containerapp env create `
            --name $EnvironmentName `
            --resource-group $ResourceGroup `
            --location $location `
            --logs-destination none 2>&1

        if ($LASTEXITCODE -eq 0) {
            $chosenLocation = $location
            Write-Host "Miljø oprettet i '$location'." -ForegroundColor Green
            break
        }

        if ($result -match "not accepting new customers" -or $result -match "LocationNotAvailable") {
            Write-Warning "Region '$location' er ikke tilgængelig lige nu. Prøver næste region i rækkefølgen."
            continue
        }

        # Uventet fejl (ikke regionsrelateret) — vis den og stop.
        Write-Host $result
        throw "Uventet fejl ved oprettelse af Container Apps-miljø i '$location'."
    }

    if (-not $chosenLocation) {
        throw "Ingen af de angivne EU/EØS-regioner ($($PreferredLocations -join ', ')) accepterer i øjeblikket nye Container Apps-miljøer. USA-regioner bruges ALDRIG som fallback. Prøv igen senere."
    }
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes)
}

$existingApp = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json

$secretNames = @("token-hash-pepper", "session-signing-secret", "rate-limit-pepper")
$generatedSecrets = @{}
if (-not $existingApp) {
    foreach ($name in $secretNames) {
        $generatedSecrets[$name] = New-RandomSecret
    }
}

if (-not $existingApp) {
    Write-Host "`nOpretter Container App '$ContainerAppName' (Consumption, min=0, max=1, scale-to-zero)..."
    $secretArgs = $secretNames | ForEach-Object { "$_=$($generatedSecrets[$_])" }

    az containerapp create `
        --name $ContainerAppName `
        --resource-group $ResourceGroup `
        --environment $EnvironmentName `
        --image $ImageName `
        --target-port 8080 `
        --ingress external `
        --min-replicas 0 `
        --max-replicas 1 `
        --system-assigned `
        --secrets $secretArgs `
        --env-vars `
            "SHAREPOINT_SITE_URL=$SharePointSiteUrl" `
            "PUBLIC_APP_URL=$PublicAppUrl" `
            "TOKEN_HASH_PEPPER=secretref:token-hash-pepper" `
            "SESSION_SIGNING_SECRET=secretref:session-signing-secret" `
            "RATE_LIMIT_PEPPER=secretref:rate-limit-pepper" | Out-Null

    Write-Host "Container App oprettet." -ForegroundColor Green
} else {
    Write-Host "Container App '$ContainerAppName' findes allerede — secrets/peppers bevares uændret." -ForegroundColor Yellow
}

$principalId = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "identity.principalId" -o tsv
$fqdn = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv

Write-Host "`nOversigt:" -ForegroundColor Cyan
Write-Host "  Resource group:            $ResourceGroup"
Write-Host "  Container Apps-miljø:      $EnvironmentName ($chosenLocation)"
Write-Host "  Container App:             $ContainerAppName"
Write-Host "  Managed Identity Principal: $principalId"
Write-Host "  Midlertidig standard-URL:  https://$fqdn"

if (-not $existingApp) {
    Write-Host "`nGenererede peppers/secrets er sat direkte i Container App'en (vises ikke igen her)." -ForegroundColor Green
}

Write-Host "`nKør dernæst:"
Write-Host "  ./scripts/configure-selected-permissions.ps1 -TenantDomain <tenant> -SiteUrl $SharePointSiteUrl -PrincipalId $principalId"
Write-Host "  ./scripts/provision-sharepoint.ps1 ..."
Write-Host "  ./scripts/configure-domain.ps1 -ContainerAppName $ContainerAppName -ResourceGroup $ResourceGroup"
