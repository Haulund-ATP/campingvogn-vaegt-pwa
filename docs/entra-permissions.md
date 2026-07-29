# Microsoft Entra og Graph-tilladelser

## 1. Runtime-identitet: Container Appens system-assigned Managed Identity

- Der oprettes **ingen** separat Entra-appregistrering til runtime — Container Appen får en
  system-assigned Managed Identity (`--system-assigned` i `provision-azure.ps1`), som automatisk
  får en tilsvarende service principal i Entra.
- Application permission: **`Sites.Selected`** på Microsoft Graph, tildelt til denne service
  principal.
- Adgang gives IKKE automatisk af `Sites.Selected` alene — den kræver en separat, eksplicit
  tildeling pr. site (`POST /sites/{id}/permissions`), udført af
  [`configure-selected-permissions.ps1`](../scripts/configure-selected-permissions.ps1), som slår
  Managed Identity'ens `appId` op via `az ad sp show --id <principalId>`.
- Bruges udelukkende til de tre konkrete SharePoint-lister på
  `https://haulundaadorf.sharepoint.com/sites/cv`.
- **Intet client secret findes nogen steder** — serveren henter Graph-tokens direkte via
  `@azure/identity`s `DefaultAzureCredential`, som i Azure automatisk bruger Managed Identity.
- **`Sites.ReadWrite.All` bruges ikke.** `Sites.Selected` er scoped korrekt til ét enkelt site og
  udgør i sig selv den mindst-privilegerede løsning; der er ingen grund til at eskalere til en
  tenant-bred tilladelse for denne løsning.

## 2. Deployment-app (`campingvogn-vaegt-pwa-deploy`)

- Ingen Graph-tilladelser. Bruges kun til Azure Resource Manager (opdatering af Container Appens
  image) via OIDC.
- Federated credential begrænset til `repo:<owner>/campingvogn-vaegt-pwa:ref:refs/heads/main` og
  `repo:<owner>/campingvogn-vaegt-pwa:environment:production`.
- Rolle: `Contributor`, scoped til den ene resource group `rg-campingvogn-vaegt-pwa` — ikke
  subscription-bred.
- Ingen permanent Azure client secret gemmes i GitHub — kun OIDC.

## Setup- vs. runtime-identitet

Provisioneringsscripts (`provision-sharepoint.ps1`, `configure-selected-permissions.ps1`) kører med
den delegerede administrators egen identitet (`Connect-MgGraph`), som midlertidigt har de bredere
rettigheder, der kræves for at oprette lister/kolonner og tildele site-adgang. Runtime-identiteten
(Managed Identity) har aldrig disse rettigheder — kun den efterfølgende `Sites.Selected`-adgang til
det ene site.
