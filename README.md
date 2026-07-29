# Campingvogn Vægt

Lille, selvstændig PWA til at registrere vægt i en campingvogn på tværs af flere trips —
uden Microsoft-login for de almindelige brugere, og med forventet driftsomkostning på 0 kr.

## Formål

Scan en QR-kode og registrer at noget er lagt i eller taget ud af campingvognen. Appen viser
løbende aktuel vægt, tilladt totalvægt og resterende lasteevne (eller overvægt). Én global
administrator-QR-kode bruges til at oprette og administrere trips; hvert trip har sine egne to
QR-koder (Tilføj vægt / Fjern vægt).

## Arkitektur

```
React + TypeScript + Vite PWA  →  Azure Static Web Apps (Free)
                                      └─ integrerede Azure Functions (Node.js/TS)
                                           └─ Microsoft Graph (app-only, Sites.Selected)
                                                └─ SharePoint Online (3 fælles lister)
```

Se [docs/architecture.md](docs/architecture.md) for detaljer.

## Forventet pris

| Komponent | Pris/måned |
|---|---:|
| Azure Static Web Apps Free | 0 kr. |
| Integrerede managed Functions | 0 kr. |
| Managed TLS | 0 kr. |
| SharePoint-lister | Inkluderet i eksisterende Microsoft 365 |
| **Samlet** | **0 kr.** |

## Forudsætninger

- Node.js 20+, npm
- PowerShell 7+
- Azure CLI (`az`), logget ind som `thomas@haulund-aadorf.dk`
- GitHub CLI (`gh`), logget ind på den personlige konto
- Microsoft.Graph PowerShell-modul (`Install-Module Microsoft.Graph -Scope CurrentUser`)
- Et Microsoft 365-tenant med SharePoint Online

## Lokal udvikling

```powershell
npm install
npm run dev            # frontend på http://localhost:5173

cd api
npm install
copy ../.env.example local.settings.json   # udfyld lokale test-værdier — commit ALDRIG denne fil
func start              # API på http://localhost:7071
```

Vite proxy'er `/api/*` til `http://localhost:7071` under `npm run dev`.

## Tests

```powershell
npm test          # frontend + shared beregningslogik + API-lib (Vitest)
npm run lint       # oxlint
```

## Provisionering (rækkefølge)

1. `./scripts/validate-environment.ps1`
2. `./scripts/login-azure.ps1`
3. `./scripts/provision-azure.ps1 -TenantId <tenant-id> -TenantDomain haulundaadorf.onmicrosoft.com -SharePointSiteUrl https://haulundaadorf.sharepoint.com/sites/cv`
4. `./scripts/configure-entra-app.ps1 -StaticWebAppName campingvogn-vaegt-pwa -ResourceGroup rg-campingvogn-vaegt-pwa`
5. `./scripts/configure-selected-permissions.ps1 -TenantDomain haulundaadorf.onmicrosoft.com -SiteUrl https://haulundaadorf.sharepoint.com/sites/cv -RuntimeAppId <client-id fra trin 4>`
6. `./scripts/provision-sharepoint.ps1 -TenantDomain haulundaadorf.onmicrosoft.com -SiteUrl https://haulundaadorf.sharepoint.com/sites/cv -TokenHashPepper <pepper fra trin 3>`
7. `./scripts/configure-domain.ps1`
8. `./scripts/configure-github-oidc.ps1 -GitHubOwner <dit-github-brugernavn>`
9. Sæt de udskrevne GitHub Environment-secrets (`production`) og push til `main` for at deploye.
10. `./scripts/generate-qr.ps1 -BaseUrl https://c.h-aa.dk -GlobalAdminToken <token fra trin 6> -OutputDirectory ./private-qr/admin`

Se [docs/sharepoint.md](docs/sharepoint.md), [docs/entra-permissions.md](docs/entra-permissions.md) og
[docs/operations.md](docs/operations.md) for detaljer, drift, tokenrotation og afinstallation.

## Trips, QR-koder og offline

Se [docs/trips.md](docs/trips.md), [docs/qr-codes.md](docs/qr-codes.md) og [docs/offline.md](docs/offline.md).

## Sikkerhed

Se [SECURITY.md](SECURITY.md) og [docs/security.md](docs/security.md).

## Fejlsøgning

- **401 fra `/api/status`**: ingen gyldig session — scan en QR-kode igen.
- **QR-kode virker ikke**: trippet kan være arkiveret, eller tokenet er roteret. Generér en ny QR-kode.
- **Static Web App bygger ikke API'et**: kontrollér at `api/package.json` og `api/host.json` findes.
- Se [docs/operations.md](docs/operations.md) for flere scenarier.
