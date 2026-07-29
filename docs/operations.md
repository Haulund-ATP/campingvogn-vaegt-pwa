# Drift

## Deployment

Push til `main` udløser `.github/workflows/deploy.yml`: bygger Docker-imaget (frontend + server i
én container), pusher det til GitHub Container Registry (`ghcr.io/<owner>/campingvogn-vaegt-pwa`),
logger ind på Azure via OIDC (ingen permanent client secret i GitHub), og opdaterer Container
Appen til det nye image. Pull requests deployer aldrig produktion og har ikke adgang til
produktions-secrets (workflowet trigges kun af `push: main` og `workflow_dispatch`).

## Opstartstid og scale-to-zero

Appen kører med `min-replicas 0`, så der er ingen udgift i hvile. Til gengæld skal replicaen vækkes
på det første kald efter en pause.

- **Cooldown-perioden** styrer hvor længe replicaen holdes i live efter sidste request. Azures
  default er 300 s; `provision-azure.ps1` sætter den til 3600 s (maksimum), så der ikke opstår cold
  start under en pakkesession. Kan ændres uden at genprovisionere:

  ```
  az containerapp update --name campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa --cooldown-period 3600
  ```

  Kræver en nogenlunde ny `containerapp`-extension (`az extension add --name containerapp --upgrade`).
  Kan den ikke sættes, kører appen videre på Azures default på 300 s.
- **Vil du fjerne cold start helt**, sæt `--min-replicas 1`. Så kører der én replica hele tiden, og
  forbruget er ikke længere ~0 kr. Der er ikke behov for det til den nuværende brug — cache-first
  app-shellen og gentagelseslogikken i klienten dækker opstartstiden. Se [offline.md](offline.md).

## Rotation

- **Globalt administratortoken**: `POST /api/admin/global-token/rotate` via administrationsfladen,
  eller nødprocedure via `scripts/generate-token.ps1` + manuel opdatering i SharePoint, hvis
  API'et ikke kan nås.
- **Trip-token**: `POST /api/admin/trips/{tripId}/public-token/rotate`.
- **Graph-adgang**: der er intet client secret at rotere — Container Appens Managed Identity
  autentificerer direkte. Skulle Managed Identity'en mistes ved en gendannelse, kør blot
  `configure-selected-permissions.ps1` igen mod den nye Container App.

## Afinstallation

1. Fjern det brugerdefinerede domæne: `az containerapp hostname delete --name campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa --hostname c.h-aa.dk`.
2. Slet DNS-recordsene hos din DNS-udbyder (eller Azure DNS-zonen, hvis den administreres der).
3. Slet Container App: `az containerapp delete --name campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa`.
4. Slet Container Apps-miljøet: `az containerapp env delete --name cae-campingvogn-vaegt-pwa --resource-group rg-campingvogn-vaegt-pwa`.
5. Slet resource group, hvis den ikke bruges til andet: `az group delete --name rg-campingvogn-vaegt-pwa`.
6. Fjern deployment-appregistreringen (`campingvogn-vaegt-pwa-deploy`) i Entra-portalen, hvis den
   ikke skal genbruges. Der er ingen runtime-appregistrering at fjerne (Managed Identity slettes
   automatisk sammen med Container Appen).
7. Fjern eventuelt image-pakken i GitHub Packages, hvis den ikke skal bevares.

## Sådan bevares SharePoint-historikken ved nedtagning

De tre SharePoint-lister (`CampingvognVaegtRegistreringer`, `CampingvognVaegtTrips`,
`CampingvognVaegtSystem`) er **ikke** en del af Azure-ressourcerne og påvirkes ikke af trin 1–5
ovenfor. Historikken forbliver i SharePoint, indtil du selv aktivt sletter listerne — hvilket ikke
er en del af nogen af scripts i dette repository. Vil du senere gendanne appen, kan du køre
`provision-azure.ps1` + `configure-selected-permissions.ps1` igen og pege på de samme eksisterende
lister; al historik er intakt.

## Kendte begrænsninger

Se afslutningsrapporten for den aktuelle liste over kendte begrænsninger og resterende manuelle
trin (f.eks. "kopiér trip"-UI og fuld gennemførsel af end-to-end-testplanen).

Background Sync er implementeret (`src/sw.ts`), men understøttes ikke af iOS/Safari. På iPhone
sendes køen i stedet ved appstart, når appen bliver synlig, og når `online`-hændelsen fyrer —
altså så snart appen åbnes med forbindelse.
