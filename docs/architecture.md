# Arkitektur

> Se også [ADR-001](adr-001-container-apps.md) for hvorfor arkitekturen skiftede fra Azure Static
> Web Apps til Azure Container Apps under provisionering.

```
┌─────────────────────────────────────┐
│  Én container (Azure Container Apps)  │
│  ┌───────────────────────────────┐   │
│  │  React + Vite PWA (statiske    │   │
│  │  filer, serveret af Express)    │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │  Node/Express API (/api/*)      │   │
│  └──────────────┬────────────────┘   │
└─────────────────┼─────────────────────┘
                  │ app-only Microsoft Graph
                  │ (system-assigned Managed Identity)
┌─────────────────▼─────────────────────┐
│  SharePoint Online (Sites.Selected)      │
│  3 fælles lister: Registreringer, Trips, │
│  System                                   │
└───────────────────────────────────────────┘
```

## Komponenter

- **Frontend** (`src/`): React 19 + TypeScript + Vite. Hash-baseret routing læser
  `#action=…&trip=…&token=…` fra QR-koder, udveksler tokenet til en session, og fjerner
  fragmentet fra adresselinjen. Offlinekø i IndexedDB (`src/lib/offlineQueue.ts`).
- **Server** (`server/`): almindelig Node/Express-server (ikke Azure Functions), der både serverer
  de byggede statiske frontend-filer og API'et under `/api/*`. Al vægtberegning sker autoritativt
  på serveren (`server/src/shared/weight.ts`), i heltal gram.
- **Data** (SharePoint): tre lister, ingen pr.-trip-lister eller -ressourcer. Se
  [sharepoint.md](sharepoint.md).
- **Identitet**: Container Appens system-assigned Managed Identity bruges direkte til Microsoft
  Graph (`Sites.Selected`) — intet client secret. En separat Entra-appregistrering bruges kun til
  GitHub Actions-deployment via OIDC. Se [entra-permissions.md](entra-permissions.md).
- **Container**: multi-stage `Dockerfile` bygger frontend (`npm run build`) og server (`tsc`) i
  separate stages, og kører den byggede server i en minimal runtime-stage som en ikke-root bruger.
  Imaget publiceres offentligt på GitHub Container Registry.

## Hvorfor denne stack

- Container Apps Consumption med `scale-to-zero` (min replicas 0) giver tæt på 0 kr. i drift ved
  privat brug, samtidig med bred EU-regionsdækning.
- SharePoint-lister genbruger eksisterende Microsoft 365-licens i stedet for en betalt database.
- Ingen pr.-trip-ressourcer: nye trips er blot nye rækker i `CampingvognVaegtTrips`.
- Managed Identity fjerner client secret-håndtering og -rotation som et sikkerhedsproblem helt.
