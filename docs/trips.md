# Trips

## Datamodel

Hvert trip er én række i `CampingvognVaegtTrips` med egen egenvægt, tilladt totalvægt, maksimal
ændring pr. registrering, aktiv/arkiveret status og eget public token (kun hash gemmes).
Registreringer i `CampingvognVaegtRegistreringer` filtreres altid på `TripId` — data fra
forskellige trips blandes aldrig, hverken i beregning, historik eller reversering.

## Oprettelse

Kun via den globale administrator-QR-kode (`POST /api/admin/trips`). TripId foreslås automatisk
ud fra tripnavnet (`slugifyTripName`), men kan ændres før oprettelse. Se valideringsregler i
`api/src/lib/validation.ts` (`isValidTripId`).

## Kopiering

Frontend/administrationsfladen understøtter i denne version oprettelse af et nyt trip fra bunden;
"kopiér fra eksisterende trip" som forudfyldning af formularen er ikke implementeret i UI'et endnu
og er en kendt begrænsning (se afslutningsrapporten). API'et forhindrer under alle omstændigheder,
at registreringer, historik, EntryId'er, tokens eller QR-koder kan overføres til et nyt trip.

## Arkivering

`POST /api/admin/trips/{tripId}/archive` sætter `IsActive=false`. Nye sessioner og registreringer
afvises for arkiverede trips, men historikken bevares og kan altid ses af administratoren.
`POST /api/admin/trips/{tripId}/activate` genaktiverer uden at røre historikken.

## Rotation af trip-token

`POST /api/admin/trips/{tripId}/public-token/rotate` genererer et nyt token, hæver
`PublicTokenVersion`, og ugyldiggør dermed alle eksisterende sessioner for netop dette trip — uden
at påvirke andre trips.
