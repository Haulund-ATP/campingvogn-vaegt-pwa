# Arkitektur

```
┌─────────────────────────┐
│  React + Vite PWA        │  service worker cacher app shell, ikke /api/*
│  (Azure Static Web Apps) │
└──────────┬───────────────┘
           │ /api/* (samme oprindelse)
┌──────────▼───────────────┐
│  Integrerede Azure         │  Node.js/TypeScript, Azure Functions v4-model
│  Functions                │  - session-exchange, status, entries, admin/*
└──────────┬───────────────┘
           │ app-only Microsoft Graph (client credentials)
┌──────────▼───────────────┐
│  SharePoint Online         │  3 fælles lister: Registreringer, Trips, System
│  (Sites.Selected)          │
└───────────────────────────┘
```

## Komponenter

- **Frontend** (`src/`): React 19 + TypeScript + Vite. Hash-baseret routing læser
  `#action=…&trip=…&token=…` fra QR-koder, udveksler tokenet til en session, og fjerner
  fragmentet fra adresselinjen. Offlinekø i IndexedDB (`src/lib/offlineQueue.ts`).
- **API** (`api/`): Azure Functions, ét integreret function-app under Static Web Apps. Al
  vægtberegning sker autoritativt på serveren (`api/src/shared/weight.ts`), i heltal gram.
- **Data** (SharePoint): tre lister, ingen pr.-trip-lister eller -ressourcer. Se
  [sharepoint.md](sharepoint.md).
- **Identitet**: separate Entra-appregistreringer til runtime (Graph, `Sites.Selected`) og til
  GitHub Actions-deployment (OIDC, ingen permanent secret). Se [entra-permissions.md](entra-permissions.md).

## Hvorfor denne stack

- Static Web Apps Free + integrerede Functions giver reelt 0 kr. i drift ved privat brug.
- SharePoint-lister genbruger eksisterende Microsoft 365-licens i stedet for en betalt database.
- Ingen pr.-trip-ressourcer: nye trips er blot nye rækker i `CampingvognVaegtTrips`.
