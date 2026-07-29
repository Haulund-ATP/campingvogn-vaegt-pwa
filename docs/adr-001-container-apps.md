# ADR-001: Skift fra Azure Static Web Apps til Azure Container Apps

## Status

Accepteret (2026-07-29).

## Kontekst

Den oprindelige arkitektur brugte Azure Static Web Apps (Free) med integrerede Azure Functions.
Under provisionering viste det sig at:

1. Azure Static Web Apps (`Microsoft.Web/staticSites`) kun kan oprettes i `centralus`, `eastus2`,
   `westus2`, `westeurope` og `eastasia` — ingen andre europæiske eller nordiske regioner
   understøttes overhovedet, uanset subscription.
2. `westeurope` — den eneste EU-region i den liste — afviste på oprettelsestidspunktet nye kunder
   ("The selected region is currently not accepting new customers").

Der er et absolut krav om, at frontend, API-behandling, runtime, logs og øvrige kundedata
forbliver i EU/EØS. USA-regioner må under ingen omstændigheder bruges, heller ikke som fallback.

## Beslutning

Skift til **Azure Container Apps (Consumption-plan)**, som understøtter et bredt sæt EU-regioner
(bl.a. Sweden Central, North Europe, West Europe, France Central m.fl.). Frontend (React/Vite) og
API (nu et almindeligt Node/Express-server i stedet for Azure Functions) samles i én container,
bygget fra ét offentligt image på GitHub Container Registry.

Samtidig droppes Entra client secret helt: Container Appen får en system-assigned Managed Identity,
som bruges direkte til Microsoft Graph (`Sites.Selected`). Dette er en sikkerhedsforbedring —
der er intet client secret at rotere, lække eller opbevare.

Regionsvalget forsøges i denne rækkefølge og stopper med en klar fejl, hvis ingen er tilgængelig:
`denmarkeast → swedencentral → swedensouth → northeurope → westeurope`. Kun `swedencentral` og
`northeurope`/`westeurope` findes reelt i `Microsoft.App/managedEnvironments`-ressourcetypens
understøttede regioner; `denmarkeast` og `swedensouth` findes slet ikke for denne ressourcetype
(bekræftet direkte mod Azure). Første forsøg, der lykkes, bruges.

## Konsekvenser

- **Positivt**: bredere EU-regionsdækning, intet client secret, `scale-to-zero` (min replicas 0)
  betyder reelt 0 kr. i hvile, og arkitekturen er enklere (én container frem for separate
  Static Web Apps + Functions-runtime-lag).
- **Negativt**: Container Apps Consumption er ikke helt så "gratis som udgangspunkt" som Static
  Web Apps Free — der er en meget lille pris pr. vCPU-sekund/GiB-sekund ved aktiv trafik, men ved
  scale-to-zero og lav privat brug er dette forventet at være tæt på 0 kr./måned. Deployment kræver
  et Docker-image i stedet for Static Web Apps' indbyggede build-pipeline.
- Provisioneringsscripts og CI/CD-workflows er opdateret til at afspejle dette (se
  `scripts/provision-azure.ps1`, `.github/workflows/deploy.yml`).
