# Campingvogn Vægt

Lille, selvstændig PWA til at registrere vægt i en campingvogn på tværs af flere trips —
uden Microsoft-login for de almindelige brugere, og med forventet driftsomkostning tæt på 0 kr.

## Formål

Scan en QR-kode og registrer at noget er lagt i eller taget ud af campingvognen. Appen viser
løbende aktuel vægt, tilladt totalvægt og resterende lasteevne (eller overvægt). Én global
administrator-QR-kode bruges til at oprette og administrere trips; hvert trip har sine egne to
QR-koder (Tilføj vægt / Fjern vægt).

## Arkitektur

```
React + TypeScript + Vite PWA + Node/Express-server (samme container)
  →  Azure Container Apps (Consumption, scale-to-zero, EU-region)
       └─ Microsoft Graph via system-assigned Managed Identity (Sites.Selected)
            └─ SharePoint Online (3 fælles lister)
```

Ingen Entra client secret findes nogen steder i denne løsning — Container Appen autentificerer
til Microsoft Graph med sin egen Managed Identity. Se [docs/architecture.md](docs/architecture.md)
for detaljer og [docs/adr-001-container-apps.md](docs/adr-001-container-apps.md) for hvorfor
arkitekturen skiftede væk fra Azure Static Web Apps undervejs.

## Forventet pris

| Komponent | Pris/måned |
|---|---:|
| Container Apps Consumption (scale-to-zero, min=0) | ~0 kr. ved normalt privat forbrug |
| Managed TLS-certifikat | 0 kr. |
| Logs destination "none" (ingen Log Analytics) | 0 kr. |
| GitHub Container Registry (offentligt image) | 0 kr. |
| SharePoint-lister | Inkluderet i eksisterende Microsoft 365 |
| **Samlet** | **~0 kr.** |

## Forudsætninger

- Node.js 20+, npm, Docker (til lokal image-build/test)
- PowerShell 7+
- Azure CLI (`az`) med `containerapp`-extension, logget ind som `thomas@haulund-aadorf.dk`
- GitHub CLI (`gh`), logget ind på den personlige konto
- Microsoft.Graph PowerShell-modul (`Install-Module Microsoft.Graph -Scope CurrentUser`)
- Et Microsoft 365-tenant med SharePoint Online

## Lokal udvikling

```powershell
npm install
npm run dev              # frontend på http://localhost:5173

cd server
npm install
copy ../.env.example .env   # udfyld lokale test-værdier — commit ALDRIG denne fil
npm run build && npm start  # server på http://localhost:8080 (Vite proxy'er /api dertil)
```

Lokalt uden for Azure falder Managed Identity-koden tilbage til `DefaultAzureCredential`, som
bruger din egen `az login`-session — sørg for at være logget ind med adgang til testsitet.

## Tests

```powershell
npm test          # frontend + shared beregningslogik + server-lib (Vitest)
npm run lint       # oxlint
```

## Provisionering (rækkefølge)

1. `./scripts/validate-environment.ps1`
2. `./scripts/login-azure.ps1`
3. `./scripts/provision-azure.ps1 -SharePointSiteUrl https://haulundaadorf.sharepoint.com/sites/cv -ImageName ghcr.io/<github-bruger>/campingvogn-vaegt-pwa:latest`
   (forsøger `denmarkeast → swedencentral → swedensouth → northeurope → westeurope`, stopper hvis ingen EU-region er tilgængelig)
4. `./scripts/configure-selected-permissions.ps1 -TenantDomain haulundaadorf.onmicrosoft.com -SiteUrl https://haulundaadorf.sharepoint.com/sites/cv -PrincipalId <Managed Identity principalId fra trin 3>`
5. `./scripts/provision-sharepoint.ps1 -TenantDomain haulundaadorf.onmicrosoft.com -SiteUrl https://haulundaadorf.sharepoint.com/sites/cv -TokenHashPepper <pepper fra trin 3>`
6. `./scripts/configure-domain.ps1`
7. `./scripts/configure-github-oidc.ps1 -GitHubOwner <dit-github-brugernavn>`
8. Sæt de udskrevne GitHub Environment-secrets (`production`, inkl. `AZURE_CONTAINER_APP_NAME`) og push til `main` — CI bygger og pusher imaget til GHCR og opdaterer Container Appen.
9. `./scripts/generate-qr.ps1 -BaseUrl https://c.h-aa.dk -GlobalAdminToken <token fra trin 5> -OutputDirectory ./private-qr/admin`

Se [docs/sharepoint.md](docs/sharepoint.md), [docs/entra-permissions.md](docs/entra-permissions.md) og
[docs/operations.md](docs/operations.md) for detaljer, drift, tokenrotation og afinstallation.

## Trips, QR-koder og offline

Se [docs/trips.md](docs/trips.md), [docs/qr-codes.md](docs/qr-codes.md) og [docs/offline.md](docs/offline.md).

## Sikkerhed

Se [SECURITY.md](SECURITY.md) og [docs/security.md](docs/security.md).

## Fejlsøgning

- **401 fra `/api/status`**: ingen gyldig session — scan en QR-kode igen.
- **Første load tager lang tid**: containeren kører scale-to-zero og skal vækkes. Appen viser
  "Serveren starter op…" og prøver selv igen — QR-koden skal ikke scannes to gange. Se
  [docs/operations.md](docs/operations.md) hvis opstartstiden skal skrues yderligere ned.
- **QR-kode virker ikke**: trippet kan være arkiveret, eller tokenet er roteret. Generér en ny QR-kode.
- **Container App starter ikke**: tjek `az containerapp logs show --name campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa` for manglende application settings.
- Se [docs/operations.md](docs/operations.md) for flere scenarier.
