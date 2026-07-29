#Requires -Version 7.0
<#
.SYNOPSIS
  Konfigurerer det brugerdefinerede domæne c.h-aa.dk på Azure Static Web App med gratis managed TLS.

.DESCRIPTION
  Forsøger først at finde h-aa.dk som en Azure DNS-zone i den aktive subscription. Findes den,
  oprettes CNAME/TXT-records automatisk. Ellers udskrives præcise manuelle DNS-instruktioner.
  Rører ALDRIG eksisterende MX/SPF/DKIM/DMARC/Autodiscover/Microsoft 365-records.
#>
param(
    [string]$StaticWebAppName = "campingvogn-vaegt-pwa",
    [string]$ResourceGroup = "rg-campingvogn-vaegt-pwa",
    [string]$CustomDomain = "c.h-aa.dk",
    [string]$RootDomain = "h-aa.dk"
)

$ErrorActionPreference = "Stop"

$defaultHostname = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv
$subdomainLabel = $CustomDomain.Replace(".$RootDomain", "")

$existingCustomDomain = az staticwebapp hostname list --name $StaticWebAppName --resource-group $ResourceGroup --query "[?name=='$CustomDomain']" | ConvertFrom-Json
if ($existingCustomDomain.Count -gt 0) {
    Write-Host "Domænet '$CustomDomain' er allerede konfigureret. Status: $($existingCustomDomain[0].status)" -ForegroundColor Yellow
} else {
    $zone = az network dns zone list --query "[?name=='$RootDomain']" 2>$null | ConvertFrom-Json
    if ($zone -and $zone.Count -gt 0) {
        $zoneRg = ($zone[0].id -split "/")[4]
        Write-Host "Fandt Azure DNS-zone for '$RootDomain' i resource group '$zoneRg'. Opretter CNAME automatisk..."
        az network dns record-set cname set-record `
            --resource-group $zoneRg `
            --zone-name $RootDomain `
            --record-set-name $subdomainLabel `
            --cname $defaultHostname | Out-Null
        Write-Host "CNAME oprettet: $CustomDomain -> $defaultHostname" -ForegroundColor Green
    } else {
        Write-Host "`nDNS for '$RootDomain' administreres IKKE i denne Azure-subscription." -ForegroundColor Yellow
        Write-Host "Opret følgende DNS-record hos din nuværende DNS-udbyder for '$RootDomain':`n"
        Write-Host "  Type:      CNAME"
        Write-Host "  Værtsnavn: $subdomainLabel"
        Write-Host "  Værdi:     $defaultHostname"
        Write-Host "  TTL:       3600 (1 time) — anbefalet"
        Write-Host "  Formål:    Peger $CustomDomain mod Azure Static Web Apps`n"
        Write-Host "Rediger eller slet ALDRIG eksisterende MX/SPF/DKIM/DMARC/Autodiscover/Microsoft 365-records." -ForegroundColor Red
        Read-Host "Tryk Enter når CNAME-recorden er oprettet og har propageret"
    }

    Write-Host "`nTilføjer det brugerdefinerede domæne til Static Web App..."
    az staticwebapp hostname set --name $StaticWebAppName --resource-group $ResourceGroup --hostname $CustomDomain | Out-Null
}

Write-Host "`nVenter på domænevalidering og gratis managed TLS-certifikat (kan tage nogle minutter)..."
for ($i = 0; $i -lt 30; $i++) {
    $status = az staticwebapp hostname show --name $StaticWebAppName --resource-group $ResourceGroup --hostname $CustomDomain --query "status" -o tsv 2>$null
    Write-Host "  Status: $status"
    if ($status -eq "Ready") { break }
    Start-Sleep -Seconds 20
}

Write-Host "`nVerificerer HTTPS og redirect..."
try {
    $response = Invoke-WebRequest -Uri "https://$CustomDomain" -MaximumRedirection 0 -SkipHttpErrorCheck
    Write-Host "  HTTPS svarer med statuskode $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Warning "Kunne ikke verificere HTTPS endnu — DNS/certifikat kan stadig være under propagering."
}

Write-Host "`nFærdig. $CustomDomain bør nu pege på Azure Static Web Apps med gyldigt, automatisk fornyet TLS-certifikat."
