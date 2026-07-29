#Requires -Version 7.0
<#
Validerer at de nødvendige værktøjer er installeret før provisionering.
#>

$ErrorActionPreference = "Stop"
$problems = @()

function Test-Tool($name, $command) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        $script:problems += "$name mangler ('$command' blev ikke fundet i PATH)"
    } else {
        Write-Host "OK: $name fundet" -ForegroundColor Green
    }
}

Test-Tool "Azure CLI" "az"
Test-Tool "GitHub CLI" "gh"
Test-Tool "Node.js" "node"
Test-Tool "npm" "npm"

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Sites)) {
    Write-Warning "Microsoft.Graph.Sites PowerShell-modul er ikke installeret. Installer med: Install-Module Microsoft.Graph -Scope CurrentUser"
}

$nodeVersion = (node --version) -replace "v", ""
$majorVersion = [int]($nodeVersion.Split(".")[0])
if ($majorVersion -lt 20) {
    $problems += "Node.js version $nodeVersion er for gammel. Kræver mindst v20."
}

if ($problems.Count -gt 0) {
    Write-Host "`nManglende forudsætninger:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "Miljøet opfylder ikke forudsætningerne. Ret ovenstående og prøv igen."
}

Write-Host "`nMiljøet er klar til provisionering." -ForegroundColor Green
