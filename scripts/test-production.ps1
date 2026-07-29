#Requires -Version 7.0
<#
.SYNOPSIS
  Grundlæggende røgtest af den kørende produktion efter deployment.
#>
param(
    [string]$BaseUrl = "https://c.h-aa.dk"
)

$ErrorActionPreference = "Stop"
$failures = @()

function Test-Case {
    param([string]$Name, [scriptblock]$Check)
    try {
        & $Check
        Write-Host "OK: $Name" -ForegroundColor Green
    } catch {
        Write-Host "FEJL: $Name — $($_.Exception.Message)" -ForegroundColor Red
        $script:failures += $Name
    }
}

Test-Case "HTTPS svarer" {
    $response = Invoke-WebRequest -Uri $BaseUrl -SkipHttpErrorCheck
    if ($response.StatusCode -ge 500) { throw "HTTP $($response.StatusCode)" }
}

Test-Case "HTTP redirecter til HTTPS" {
    $httpUrl = $BaseUrl -replace "^https://", "http://"
    $response = Invoke-WebRequest -Uri $httpUrl -MaximumRedirection 0 -SkipHttpErrorCheck
    if ($response.StatusCode -lt 300 -or $response.StatusCode -ge 400) { throw "Forventede redirect, fik HTTP $($response.StatusCode)" }
}

Test-Case "Forsiden viser ikke vægtdata uden session" {
    $response = Invoke-WebRequest -Uri $BaseUrl -SkipHttpErrorCheck
    if ($response.Content -notmatch "Scan en QR-kode") { throw "Landing page-teksten blev ikke fundet" }
}

Test-Case "/api/status uden session afvises" {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/status" -SkipHttpErrorCheck
    if ($response.StatusCode -ne 401) { throw "Forventede 401, fik $($response.StatusCode)" }
}

Test-Case "Ugyldigt admin-token afvises" {
    $body = @{ token = "ugyldigt-token-1234567890" } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/session/admin/exchange" -Method POST -Body $body -ContentType "application/json" -SkipHttpErrorCheck
    if ($response.StatusCode -ne 401) { throw "Forventede 401, fik $($response.StatusCode)" }
}

if ($failures.Count -gt 0) {
    Write-Host "`n$($failures.Count) test(s) fejlede:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "`nAlle produktionstests bestod." -ForegroundColor Green
