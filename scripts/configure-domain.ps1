#Requires -Version 7.0
<#
.SYNOPSIS
  Konfigurerer det brugerdefinerede domæne c.h-aa.dk på Azure Container Apps med gratis
  managed TLS-certifikat.

.DESCRIPTION
  Forsøger først at finde h-aa.dk som en Azure DNS-zone i den aktive subscription. Findes den,
  oprettes CNAME/TXT-records automatisk. Ellers udskrives præcise manuelle DNS-instruktioner.
  Rører ALDRIG eksisterende MX/SPF/DKIM/DMARC/Autodiscover/Microsoft 365-records.
#>
param(
    [string]$ContainerAppName = "campingvogn-vaegt-pwa",
    [string]$ResourceGroup = "rg-campingvogn-vaegt-pwa",
    [string]$EnvironmentName = "cae-campingvogn-vaegt-pwa",
    [string]$CustomDomain = "c.h-aa.dk",
    [string]$RootDomain = "h-aa.dk"
)

$ErrorActionPreference = "Stop"

$fqdn = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv
$verificationId = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "properties.customDomainVerificationId" -o tsv
$subdomainLabel = $CustomDomain.Replace(".$RootDomain", "")

$existingHostnames = az containerapp hostname list --name $ContainerAppName --resource-group $ResourceGroup | ConvertFrom-Json
$alreadyConfigured = $existingHostnames | Where-Object { $_.name -eq $CustomDomain }

if ($alreadyConfigured) {
    Write-Host "Domænet '$CustomDomain' er allerede tilføjet." -ForegroundColor Yellow
} else {
    $zone = az network dns zone list --query "[?name=='$RootDomain']" 2>$null | ConvertFrom-Json
    if ($zone -and $zone.Count -gt 0) {
        $zoneRg = ($zone[0].id -split "/")[4]
        Write-Host "Fandt Azure DNS-zone for '$RootDomain' i resource group '$zoneRg'. Opretter records automatisk..."
        az network dns record-set cname set-record --resource-group $zoneRg --zone-name $RootDomain --record-set-name $subdomainLabel --cname $fqdn | Out-Null
        az network dns record-set txt add-record --resource-group $zoneRg --zone-name $RootDomain --record-set-name "asuid.$subdomainLabel" --value $verificationId | Out-Null
        Write-Host "DNS-records oprettet." -ForegroundColor Green
    } else {
        Write-Host "`nDNS for '$RootDomain' administreres IKKE i denne Azure-subscription." -ForegroundColor Yellow
        Write-Host "Opret følgende to DNS-records hos din nuværende DNS-udbyder for '$RootDomain':`n"
        Write-Host "  1) Type: CNAME   Værtsnavn: $subdomainLabel              Værdi: $fqdn"
        Write-Host "  2) Type: TXT     Værtsnavn: asuid.$subdomainLabel       Værdi: $verificationId"
        Write-Host "  TTL: 3600 (1 time) — anbefalet.`n"
        Write-Host "Rediger eller slet ALDRIG eksisterende MX/SPF/DKIM/DMARC/Autodiscover/Microsoft 365-records." -ForegroundColor Red
        if ([Environment]::UserInteractive) {
            Read-Host "Tryk Enter når begge records er oprettet og har propageret"
        } else {
            Write-Host "Ikke-interaktiv kørsel: fortsætter uden at vente. Kør scriptet igen, når DNS er propageret, hvis hostname-tilføjelsen fejler." -ForegroundColor Yellow
        }
    }

    Write-Host "`nTilføjer det brugerdefinerede domæne til Container App..."
    az containerapp hostname add --name $ContainerAppName --resource-group $ResourceGroup --hostname $CustomDomain | Out-Null
}

Write-Host "`nBinder gratis managed TLS-certifikat..."
az containerapp hostname bind `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --environment $EnvironmentName `
    --hostname $CustomDomain `
    --validation-method CNAME | Out-Null

Write-Host "`nVerificerer HTTPS og redirect..."
try {
    $response = Invoke-WebRequest -Uri "https://$CustomDomain" -SkipHttpErrorCheck
    Write-Host "  HTTPS svarer med statuskode $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Warning "Kunne ikke verificere HTTPS endnu — DNS/certifikat kan stadig være under propagering."
}

Write-Host "`nFærdig. $CustomDomain bør nu pege på Container Appen med gyldigt, automatisk fornyet TLS-certifikat."
