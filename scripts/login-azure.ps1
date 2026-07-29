#Requires -Version 7.0
<#
Logger ind på Azure CLI som thomas@haulund-aadorf.dk og verificerer aktiv bruger og subscription.
Idempotent: kan køres igen uden at ødelægge eksisterende login, men tvinger altid en frisk device-code-login.
#>
param(
    [string]$ExpectedUser = "thomas@haulund-aadorf.dk"
)

$ErrorActionPreference = "Stop"

Write-Host "Logger ud af eksisterende Azure CLI-sessioner..."
az logout 2>$null | Out-Null
az account clear | Out-Null

Write-Host "Starter device-code-login. Følg linket og koden herunder."
az login --use-device-code | Out-Null

$activeUser = az account show --query user.name --output tsv

if ($activeUser -ne $ExpectedUser) {
    throw "Forkert Azure-bruger. Forventede '$ExpectedUser', men fandt '$activeUser'."
}

Write-Host "Logget ind som $activeUser." -ForegroundColor Green

Write-Host "`nTilgængelige subscriptions:"
az account list --query "[].{Name:name,SubscriptionId:id,State:state,TenantId:tenantId,Default:isDefault}" --output table

$subscriptions = az account list --query "[?state=='Enabled']" | ConvertFrom-Json
if ($subscriptions.Count -eq 1) {
    az account set --subscription $subscriptions[0].id
    Write-Host "Anvender den eneste aktive subscription: $($subscriptions[0].name)" -ForegroundColor Green
} else {
    Write-Warning "Flere aktive subscriptions fundet. Vælg selv med 'az account set --subscription <id>' før du fortsætter."
}
