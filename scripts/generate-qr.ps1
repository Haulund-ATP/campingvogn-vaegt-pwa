#Requires -Version 7.0
<#
.SYNOPSIS
  Genererer QR-koder (PNG + PDF) til den globale administrator eller til ét trip.
  Aktive QR-koder skrives til private-qr/ og må aldrig commits (se .gitignore).

.EXAMPLE
  ./scripts/generate-qr.ps1 -BaseUrl "https://c.h-aa.dk" -GlobalAdminToken "<token>" -OutputDirectory "./private-qr/admin"

.EXAMPLE
  ./scripts/generate-qr.ps1 -BaseUrl "https://c.h-aa.dk" -TripId "norge-2026" -DisplayName "Norgesturen 2026" -PublicToken "<token>" -OutputDirectory "./private-qr/norge-2026"
#>
param(
    [Parameter(Mandatory = $true)] [string]$BaseUrl,
    [string]$GlobalAdminToken,
    [string]$TripId,
    [string]$DisplayName,
    [string]$PublicToken,
    [Parameter(Mandatory = $true)] [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

$nodeArgs = @("$repoRoot/scripts/generate-qr.mjs", "--baseUrl", $BaseUrl, "--outputDirectory", $OutputDirectory)
if ($GlobalAdminToken) {
    $nodeArgs += @("--globalAdminToken", $GlobalAdminToken)
} elseif ($TripId -and $PublicToken) {
    $nodeArgs += @("--tripId", $TripId, "--publicToken", $PublicToken)
    if ($DisplayName) { $nodeArgs += @("--displayName", $DisplayName) }
} else {
    throw "Angiv enten -GlobalAdminToken, eller -TripId og -PublicToken."
}

node @nodeArgs
