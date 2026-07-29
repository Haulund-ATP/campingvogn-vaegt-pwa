# Drift

## Deployment

Push til `main` udløser `.github/workflows/deploy.yml`: bygger frontend + API, logger ind på
Azure via OIDC (ingen permanent client secret i GitHub), henter Static Web Apps-deployment-token
under kørslen (maskeret, aldrig udskrevet), og deployer. Pull requests deployer aldrig produktion
og har ikke adgang til produktions-secrets (workflowet trigges kun af `push: main` og
`workflow_dispatch`).

## Rotation

- **Globalt administratortoken**: `POST /api/admin/global-token/rotate` via administrationsfladen,
  eller nødprocedure via `scripts/generate-token.ps1` + manuel opdatering i SharePoint, hvis
  API'et ikke kan nås.
- **Trip-token**: `POST /api/admin/trips/{tripId}/public-token/rotate`.
- **Client secret** (Graph): `scripts/rotate-client-secret.ps1` — opretter nyt secret, sætter det
  direkte i Azure, og du fjerner selv det gamle i Entra-portalen, når du har bekræftet drift.

## Afinstallation

1. Fjern det brugerdefinerede domæne: `az staticwebapp hostname delete --name campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa --hostname c.h-aa.dk`.
2. Slet DNS-recorden hos din DNS-udbyder (eller Azure DNS-zonen, hvis den administreres der).
3. Slet Static Web App: `az staticwebapp delete --name campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa`.
4. Slet resource group, hvis den ikke bruges til andet: `az group delete --name rg-campingvogn-vaegt-pwa`.
5. Fjern appregistreringerne (`campingvogn-vaegt-pwa-runtime`, `campingvogn-vaegt-pwa-deploy`) i
   Entra-portalen, hvis de ikke skal genbruges.

## Sådan bevares SharePoint-historikken ved nedtagning

De tre SharePoint-lister (`CampingvognVaegtRegistreringer`, `CampingvognVaegtTrips`,
`CampingvognVaegtSystem`) er **ikke** en del af Azure-ressourcerne og påvirkes ikke af trin 1–4
ovenfor. Historikken forbliver i SharePoint, indtil du selv aktivt sletter listerne — hvilket ikke
er en del af nogen af scripts i dette repository. Vil du senere gendanne appen, kan du køre
`provision-azure.ps1` + `configure-entra-app.ps1` + `configure-selected-permissions.ps1` igen og
pege på de samme eksisterende lister; al historik er intakt.

## Kendte begrænsninger

Se afslutningsrapporten for den aktuelle liste over kendte begrænsninger og resterende manuelle
trin (f.eks. "kopiér trip"-UI, Background Sync, og fuld gennemførsel af end-to-end-testplanen).
