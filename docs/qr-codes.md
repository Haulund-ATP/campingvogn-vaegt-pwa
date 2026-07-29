# QR-koder

## Typer

1. **Global administrator** — `#action=admin&token=<global-admin-token>`. Ikke tripbundet. Giver
   adgang til hele tripoversigten og alle administrative handlinger.
2. **Trip: Tilføj vægt** — `#action=add&trip=<tripId>&token=<public-token>`.
3. **Trip: Fjern vægt** — `#action=remove&trip=<tripId>&token=<public-token>`.

Samme public token bruges til begge trip-handlinger — `action` er UI-routing, ikke en
autorisationsgrænse. Serveren bestemmer altid selv fortegnet på `WeightDelta` ud fra handlingen.

## Generering

`scripts/generate-qr.ps1` (wrapper om `scripts/generate-qr.mjs`, som bruger `qrcode` + `pdf-lib`)
genererer PNG pr. QR-kode og et samlet PDF-ark. Output skrives til `private-qr/`, som er
git-ignoreret og aldrig må commits.

```powershell
./scripts/generate-qr.ps1 -BaseUrl "https://c.h-aa.dk" -GlobalAdminToken "<token>" -OutputDirectory "./private-qr/admin"
./scripts/generate-qr.ps1 -BaseUrl "https://c.h-aa.dk" -TripId "norge-2026" -DisplayName "Norgesturen 2026" -PublicToken "<token>" -OutputDirectory "./private-qr/norge-2026"
```

Administrationsfladen kan derudover generere og downloade QR-koderne direkte i browseren
(`src/pages/AdminPage.tsx`) uden at gemme det klare token permanent på serveren — det vises kun i
API-svaret fra oprettelse/rotation, og kan ikke hentes igen bagefter.

## Hvis en QR-kode mistes

Rotér det tilhørende token (globalt eller pr. trip) — de gamle QR-koder holder op med at virke med
det samme, fordi tokenversionen hæves.
