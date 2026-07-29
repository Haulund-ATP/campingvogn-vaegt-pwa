#Requires -Version 7.0
<#
.SYNOPSIS
  Idempotent provisionering af de tre fælles SharePoint-lister for Campingvogn Vægt-PWA.

.DESCRIPTION
  Opretter (eller genbruger) CampingvognVaegtRegistreringer, CampingvognVaegtTrips og
  CampingvognVaegtSystem med de kolonner, indeks og den systemrække, som API'et forventer.
  Genkørsel opretter ikke dubletter, overskriver ikke tokens og sletter aldrig data.

.EXAMPLE
  ./scripts/provision-sharepoint.ps1 `
    -TenantDomain "haulundaadorf.onmicrosoft.com" `
    -SiteUrl "https://haulundaadorf.sharepoint.com/sites/cv" `
    -TokenHashPepper "<samme-pepper-som-bruges-i-Azure-app-settings>"
#>
param(
    [Parameter(Mandatory = $true)] [string]$TenantDomain,
    [Parameter(Mandatory = $true)] [string]$SiteUrl,
    [Parameter(Mandatory = $true)] [string]$TokenHashPepper,
    [string]$EntriesListName = "CampingvognVaegtRegistreringer",
    [string]$TripsListName = "CampingvognVaegtTrips",
    [string]$SystemListName = "CampingvognVaegtSystem",
    [string]$PublicAppUrl = "https://c.h-aa.dk"
)

$ErrorActionPreference = "Stop"

function New-HashedToken {
    param([string]$Pepper)
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    $hmac = New-Object System.Security.Cryptography.HMACSHA256(, [System.Text.Encoding]::UTF8.GetBytes($Pepper))
    $hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))
    $hash = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
    return @{ Token = $token; Hash = $hash }
}

Write-Host "Validerer parametre..."
if ($SiteUrl -notmatch "^https://[a-z0-9-]+\.sharepoint\.com/sites/[A-Za-z0-9_-]+$") {
    throw "SiteUrl ser ikke ud til at være en gyldig SharePoint-site-URL: $SiteUrl"
}
if ($TenantDomain -notmatch "\.onmicrosoft\.com$") {
    throw "TenantDomain skal ende på .onmicrosoft.com: $TenantDomain"
}

Import-Module Microsoft.Graph.Authentication -ErrorAction Stop
Import-Module Microsoft.Graph.Sites -ErrorAction Stop

Write-Host "Forbinder til Microsoft Graph med delegeret admin-adgang (kræver Sites.FullControl.All)..."
Connect-MgGraph -Scopes "Sites.FullControl.All" -TenantId $TenantDomain -NoWelcome

$siteRelativePath = ([Uri]$SiteUrl).AbsolutePath.TrimStart("/")
$hostName = ([Uri]$SiteUrl).Host
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${hostName}:/${siteRelativePath}"
$siteId = $site.id
Write-Host "Fandt site: $($site.displayName) ($siteId)" -ForegroundColor Green

function Get-OrCreateList {
    param([string]$Name, [string]$Description)

    $existing = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists?`$filter=displayName eq '$Name'"
    if ($existing.value.Count -gt 0) {
        Write-Host "Liste '$Name' findes allerede." -ForegroundColor Yellow
        return $existing.value[0]
    }

    Write-Host "Opretter liste '$Name'..."
    $body = @{
        displayName = $Name
        description = $Description
        list        = @{ template = "genericList" }
    } | ConvertTo-Json

    $created = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists" -Body $body -ContentType "application/json"
    Write-Host "Liste '$Name' oprettet." -ForegroundColor Green
    return $created
}

function Get-ExistingColumns {
    param([string]$ListId)
    $result = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$ListId/columns"
    return $result.value | Where-Object { -not $_.readOnly }
}

function Set-ColumnsIdempotent {
    param([string]$ListId, [array]$ColumnDefinitions)

    $existing = Get-ExistingColumns -ListId $ListId
    $existingNames = $existing | ForEach-Object { $_.name }

    foreach ($col in $ColumnDefinitions) {
        if ($existingNames -contains $col.name) {
            $current = $existing | Where-Object { $_.name -eq $col.name } | Select-Object -First 1
            $expectedType = $col.expectedType
            # Invoke-MgGraphRequest returnerer Hashtables, ikke PSCustomObjects — brug ContainsKey,
            # ikke .PSObject.Properties (som kun reflekterer Hashtable-typens egne .NET-medlemmer).
            $matchesType = $current.ContainsKey($expectedType)
            if (-not $matchesType) {
                throw "Kolonnen '$($col.name)' findes allerede med en anden datatype end forventet ($expectedType). Ret manuelt eller vælg et andet listenavn."
            }
            Write-Host "  Kolonne '$($col.name)' findes allerede og matcher forventet type." -ForegroundColor Yellow
            continue
        }

        Write-Host "  Opretter kolonne '$($col.name)'..."
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$ListId/columns" -Body ($col.definition | ConvertTo-Json -Depth 10) -ContentType "application/json" | Out-Null
    }
}

# --- Registreringer ---
$entriesList = Get-OrCreateList -Name $EntriesListName -Description "Vægtregistreringer på tværs af alle trips"
$entriesColumns = @(
    @{ name = "WeightDelta"; expectedType = "number"; definition = @{ name = "WeightDelta"; number = @{ decimalPlaces = "two" } } }
    @{ name = "Category"; expectedType = "choice"; definition = @{ name = "Category"; choice = @{ choices = @("Campingudstyr", "Mad og drikke", "Vand", "Gas", "Tøj", "Personlige ting", "Køkken", "Elektronik", "Andet") } } }
    @{ name = "Notes"; expectedType = "text"; definition = @{ name = "Notes"; text = @{ allowMultipleLines = $true } } }
    @{ name = "EntryId"; expectedType = "text"; definition = @{ name = "EntryId"; text = @{}; indexed = $true } }
    @{ name = "TripId"; expectedType = "text"; definition = @{ name = "TripId"; text = @{}; indexed = $true } }
    @{ name = "Source"; expectedType = "choice"; definition = @{ name = "Source"; choice = @{ choices = @("PWA", "Administration", "Import") } } }
    @{ name = "DeviceLabel"; expectedType = "text"; definition = @{ name = "DeviceLabel"; text = @{} } }
    @{ name = "OccurredAt"; expectedType = "dateTime"; definition = @{ name = "OccurredAt"; dateTime = @{ format = "dateTime" }; indexed = $true } }
    @{ name = "ClientTimeZone"; expectedType = "text"; definition = @{ name = "ClientTimeZone"; text = @{} } }
    @{ name = "EntryType"; expectedType = "choice"; definition = @{ name = "EntryType"; choice = @{ choices = @("Addition", "Removal", "Reversal") } } }
    @{ name = "ReversesEntryId"; expectedType = "text"; definition = @{ name = "ReversesEntryId"; text = @{}; indexed = $true } }
    @{ name = "SyncedOffline"; expectedType = "boolean"; definition = @{ name = "SyncedOffline"; boolean = @{} } }
)
Set-ColumnsIdempotent -ListId $entriesList.id -ColumnDefinitions $entriesColumns

# --- Trips ---
$tripsList = Get-OrCreateList -Name $TripsListName -Description "Én række pr. trip"
$tripsColumns = @(
    # Bemærk: kolonnen hedder bevidst 'TripDisplayName', ikke 'DisplayName' — Microsoft Graphs
    # SharePoint-liste-API accepterer stille skriv til et felt kaldet præcis 'DisplayName' (HTTP 200),
    # men gemmer aldrig værdien (bekræftet ved direkte test). Det er et reserveret feltnavn.
    @{ name = "TripDisplayName"; expectedType = "text"; definition = @{ name = "TripDisplayName"; text = @{} } }
    @{ name = "StartWeight"; expectedType = "number"; definition = @{ name = "StartWeight"; number = @{ decimalPlaces = "two" } } }
    @{ name = "MaximumWeight"; expectedType = "number"; definition = @{ name = "MaximumWeight"; number = @{ decimalPlaces = "two" } } }
    @{ name = "MaximumEntryWeight"; expectedType = "number"; definition = @{ name = "MaximumEntryWeight"; number = @{ decimalPlaces = "two" } } }
    @{ name = "IsActive"; expectedType = "boolean"; definition = @{ name = "IsActive"; boolean = @{}; indexed = $true } }
    @{ name = "PublicTokenHash"; expectedType = "text"; definition = @{ name = "PublicTokenHash"; text = @{} } }
    @{ name = "PublicTokenVersion"; expectedType = "number"; definition = @{ name = "PublicTokenVersion"; number = @{ decimalPlaces = "none" } } }
    @{ name = "PublicTokenExpires"; expectedType = "dateTime"; definition = @{ name = "PublicTokenExpires"; dateTime = @{ format = "dateTime" } } }
    @{ name = "ConfiguredAt"; expectedType = "dateTime"; definition = @{ name = "ConfiguredAt"; dateTime = @{ format = "dateTime" } } }
    @{ name = "ArchivedAt"; expectedType = "dateTime"; definition = @{ name = "ArchivedAt"; dateTime = @{ format = "dateTime" }; indexed = $true } }
    @{ name = "CreatedByAdminSessionId"; expectedType = "text"; definition = @{ name = "CreatedByAdminSessionId"; text = @{} } }
)
Set-ColumnsIdempotent -ListId $tripsList.id -ColumnDefinitions $tripsColumns

# Title skal være unik (bruges som TripId)
Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$($tripsList.id)/columns/Title" -Body (@{ enforceUniqueValues = $true; indexed = $true } | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null

# --- System ---
$systemList = Get-OrCreateList -Name $SystemListName -Description "Enkelt systemrække med globalt administratortoken"
$systemColumns = @(
    @{ name = "SchemaVersion"; expectedType = "text"; definition = @{ name = "SchemaVersion"; text = @{} } }
    @{ name = "GlobalAdminTokenHash"; expectedType = "text"; definition = @{ name = "GlobalAdminTokenHash"; text = @{} } }
    @{ name = "GlobalAdminTokenVersion"; expectedType = "number"; definition = @{ name = "GlobalAdminTokenVersion"; number = @{ decimalPlaces = "none" } } }
    @{ name = "GlobalAdminTokenExpires"; expectedType = "dateTime"; definition = @{ name = "GlobalAdminTokenExpires"; dateTime = @{ format = "dateTime" } } }
    @{ name = "InstallationId"; expectedType = "text"; definition = @{ name = "InstallationId"; text = @{}; indexed = $true } }
    @{ name = "CreatedAt"; expectedType = "dateTime"; definition = @{ name = "CreatedAt"; dateTime = @{ format = "dateTime" } } }
    @{ name = "UpdatedAt"; expectedType = "dateTime"; definition = @{ name = "UpdatedAt"; dateTime = @{ format = "dateTime" } } }
    @{ name = "PublicBaseUrl"; expectedType = "text"; definition = @{ name = "PublicBaseUrl"; text = @{} } }
)
Set-ColumnsIdempotent -ListId $systemList.id -ColumnDefinitions $systemColumns

# --- Systemrække + første globale administratortoken ---
$existingSystemItems = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$($systemList.id)/items?`$expand=fields&`$filter=fields/Title eq 'system'" -Headers @{ Prefer = "HonorNonIndexedQueriesWarningMayFailRandomly" }

if ($existingSystemItems.value.Count -gt 0) {
    Write-Host "`nSystemrækken findes allerede. Det eksisterende globale administratortoken bevares (kan ikke vises igen)." -ForegroundColor Yellow
    Write-Host "Brug adminfladen (POST /api/admin/global-token/rotate) eller scripts/generate-token.ps1 til at rotere tokenet, hvis det er mistet." -ForegroundColor Yellow
} else {
    Write-Host "`nOpretter systemrække og genererer det første globale administratortoken..."
    $result = New-HashedToken -Pepper $TokenHashPepper
    $installationId = [guid]::NewGuid().ToString()
    $now = (Get-Date).ToUniversalTime().ToString("o")

    $fields = @{
        Title                   = "system"
        SchemaVersion           = "1.0"
        GlobalAdminTokenHash    = $result.Hash
        GlobalAdminTokenVersion = 1
        InstallationId          = $installationId
        CreatedAt               = $now
        UpdatedAt               = $now
        PublicBaseUrl           = $PublicAppUrl
    }
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$($systemList.id)/items" -Body (@{ fields = $fields } | ConvertTo-Json -Depth 10) -ContentType "application/json" | Out-Null

    $adminUrl = "$PublicAppUrl/#action=admin&token=$($result.Token)"

    Write-Host "`n=================================================================" -ForegroundColor Green
    Write-Host " GLOBALT ADMINISTRATORTOKEN (vises kun denne ene gang):" -ForegroundColor Green
    Write-Host " $($result.Token)"
    Write-Host " Administrator-URL: $adminUrl"
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host "Gem denne værdi sikkert nu. Generer QR-koden med scripts/generate-qr.ps1 -GlobalAdminToken '$($result.Token)'.`n"
}

Write-Host "`nOversigt:" -ForegroundColor Cyan
Write-Host "  Site ID:            $siteId"
Write-Host "  Entries List ID:    $($entriesList.id)"
Write-Host "  Trips List ID:      $($tripsList.id)"
Write-Host "  System List ID:     $($systemList.id)"
Write-Host "`nBrug disse ID'er som SHAREPOINT_SITE_ID / ENTRIES_LIST_ID / TRIPS_LIST_ID / SYSTEM_LIST_ID i Azure Static Web Apps application settings."
