# SharePoint-lister

Provisioneres idempotent af [`scripts/provision-sharepoint.ps1`](../scripts/provision-sharepoint.ps1).
Genkørsel opretter ikke dubletter og sletter aldrig data.

## CampingvognVaegtRegistreringer

Én række pr. registrering (tilføjelse, fjernelse eller reversering). Nøglefelter: `EntryId` (GUID,
unik, indekseret), `TripId` (indekseret), `WeightDelta` (positiv ved tilføjelse, negativ ved
fjernelse), `EntryType` (`Addition`/`Removal`/`Reversal`), `OccurredAt` (indekseret),
`ReversesEntryId` (indekseret). Se `campingvogn-vaegt-pwa-agentopgave.md` for det fulde kolonneskema.

## CampingvognVaegtTrips

Én række pr. trip. `Title` bruges som TripId (unik, indekseret). Indeholder egenvægt, tilladt
totalvægt, maksimal ændring pr. registrering, `IsActive`, og kun HMAC-hash + version af
public token — aldrig tokenet i klartekst.

**Afvigelse fra den oprindelige opgavebeskrivelse:** kolonnen med tripnavnet hedder
`TripDisplayName`, ikke `DisplayName`. Microsoft Graphs SharePoint-liste-API accepterer stille
skriv til et felt kaldet præcis `DisplayName` (HTTP 200), men gemmer aldrig værdien — bekræftet ved
direkte test mod tenanten. Det er tilsyneladende et reserveret feltnavn i Graphs liste-item-model.

## CampingvognVaegtSystem

Én enkelt række med `Title = "system"`. Indeholder kun HMAC-hash + version af det globale
administratortoken, installations-id og `PublicBaseUrl`.

## Indeks

`EntryId`, `TripId`, `OccurredAt`, `Category`, `ReversesEntryId` (registreringer); `Title`,
`IsActive`, `ArchivedAt` (trips); `Title`, `InstallationId` (system).

## List view threshold

Alle forespørgsler filtrerer på indekserede felter (typisk `TripId`) og bruger paginering
(`@odata.nextLink`) for at undgå at ramme SharePoints list view threshold på store lister.
