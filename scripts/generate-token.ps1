#Requires -Version 7.0
<#
.SYNOPSIS
  Nødprocedure: genererer manuelt et nyt token + HMAC-hash, hvis API-rotationsendpointet
  ikke er tilgængeligt og et token skal genskabes direkte i SharePoint.

.DESCRIPTION
  Brug kun denne, hvis /api/admin/global-token/rotate eller /api/admin/trips/{id}/public-token/rotate
  ikke kan nås. Hashen skal indsættes manuelt i henholdsvis GlobalAdminTokenHash eller
  PublicTokenHash, og versionsnummeret skal hæves manuelt for at ugyldiggøre gamle sessioner.
#>
param(
    [Parameter(Mandatory = $true)] [string]$TokenHashPepper
)

$ErrorActionPreference = "Stop"

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")

$hmac = New-Object System.Security.Cryptography.HMACSHA256([System.Text.Encoding]::UTF8.GetBytes($TokenHashPepper))
$hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))
$hash = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

Write-Host "`n================================================================="  -ForegroundColor Green
Write-Host " Nyt token (vises kun nu — indsæt IKKE denne værdi i SharePoint):" -ForegroundColor Green
Write-Host " $token"
Write-Host " HMAC-hash (indsæt DENNE i GlobalAdminTokenHash / PublicTokenHash):" -ForegroundColor Green
Write-Host " $hash"
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "Husk også at hæve det tilhørende versionsnummer for at ugyldiggøre eksisterende sessioner."
