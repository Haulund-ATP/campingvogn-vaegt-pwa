# Microsoft Entra og Graph-tilladelser

To adskilte appregistreringer:

## 1. Runtime-app (`campingvogn-vaegt-pwa-runtime`)

- Application permission: **`Sites.Selected`** på Microsoft Graph.
- Adgang gives IKKE automatisk af `Sites.Selected` alene — den kræver en separat, eksplicit
  tildeling pr. site (`POST /sites/{id}/permissions`), udført af
  [`configure-selected-permissions.ps1`](../scripts/configure-selected-permissions.ps1).
- Bruges udelukkende til de tre konkrete SharePoint-lister på
  `https://haulundaadorf.sharepoint.com/sites/cv`.
- Client secret sættes direkte som Azure Static Web Apps application setting — aldrig i Git,
  aldrig udskrevet i logs.
- **`Sites.ReadWrite.All` bruges ikke.** Hvis `Sites.Selected` mod forventning ikke er stabilt
  tilgængeligt i tenanten, er `Sites.Selected` scoped korrekt til ét enkelt site og udgør derfor
  i sig selv allerede den mindst-privilegerede løsning; der er ingen grund til at eskalere til en
  tenant-bred tilladelse for denne løsning.

## 2. Deployment-app (`campingvogn-vaegt-pwa-deploy`)

- Ingen Graph-tilladelser. Bruges kun til Azure Resource Manager via OIDC.
- Federated credential begrænset til `repo:<owner>/campingvogn-vaegt-pwa:ref:refs/heads/main` og
  `repo:<owner>/campingvogn-vaegt-pwa:environment:production`.
- Rolle: `Contributor`, scoped til den ene resource group `rg-campingvogn-vaegt-pwa` — ikke
  subscription-bred.
- Ingen permanent Azure client secret gemmes i GitHub.

## Setup- vs. runtime-identitet

Provisioneringsscripts (`provision-sharepoint.ps1`, `configure-selected-permissions.ps1`) kører med
den delegerede administrators egen identitet (`Connect-MgGraph`), som midlertidigt har de bredere
rettigheder, der kræves for at oprette lister/kolonner og tildele site-adgang. Runtime-appen har
aldrig disse rettigheder — kun den efterfølgende `Sites.Selected`-adgang til det ene site.
