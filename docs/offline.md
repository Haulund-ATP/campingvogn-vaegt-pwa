# Offline og opstart

Implementeret i `src/sw.ts` (service worker), `src/lib/offlineQueue.ts` (IndexedDB via `idb`),
`src/lib/sync.ts`, `src/lib/statusCache.ts` og `src/lib/keepAlive.ts`.

## Hurtig opstart

Containeren kører scale-to-zero, så det første kald efter en pause skal vække den. Tre ting gør,
at det ikke opleves som et hængende program:

1. **App-shellen serveres cache-first** af service workeren. Appen tegner sig med det samme,
   uafhængigt af om serveren er vågen. `index.html` er precachet; `dist/assets/*` er
   indholdshashede og hentes fra cachen.
2. **Skeletten står i `index.html`**, så der er noget på skærmen allerede før JavaScript er kørt.
3. **API-kald gentages ved forbigående fejl** (`src/lib/apiClient.ts`): timeout på 25 s og tre
   gentagelser med voksende pause ved netværksfejl og 408/425/500/502/503/504. Mens det sker,
   skifter opstartsskærmen til "Serveren starter op…". 429 gentages ikke.

Cooldown-perioden på Container Appen (`scripts/provision-azure.ps1 -CooldownPeriodSeconds`, default
3600 s) holder replicaen i live en time efter sidste request, så kun det allerførste kald i en
pakkesession betaler for opstarten.

## QR-koden skal kun scannes én gang

Tokenet i URL-hash'et ryddes **først når sessionen står** (`src/App.tsx`). Fejler udvekslingen,
bliver hash'et liggende, og "Prøv igen" bruger samme token — uden at scanne igen. Serveren tæller
kun mislykkede udvekslinger mod rate limit, så gentagelser af et gyldigt scan er gratis.

## Offlinekø

Hver registrering får et stabilt `EntryId` (UUID) med det samme, uanset om enheden er online eller
offline. Ved offline-forsøg lægges posten i IndexedDB med det samme `EntryId`, som genbruges ved
alle efterfølgende synkroniseringsforsøg — det er det, der gør serverens idempotens-kontrol
(samme `EntryId` ⇒ samme resultat) effektiv mod dubletter.

### Synkroniseringstidspunkter

- Ved appstart.
- Når `online`-hændelsen fyrer, og når appen bliver synlig igen.
- Efter hver vellykket registrering.
- Via **Background Sync** i service workeren (tag `cv-queue-flush`), som browseren kalder når
  forbindelsen er tilbage — også hvis appen er lukket. Ikke understøttet på iOS; der dækker
  punkterne ovenfor.

### Hvornår en post opgives

- **Offline eller 5xx**: køen bevares urørt, forsøget gentages senere.
- **401/403**: synkroniseringen stopper ved første post og bevarer hele køen, så den kan sendes
  efter et nyt QR-scan. Køen flyttes aldrig mellem trips.
- **Øvrige 4xx** (fx arkiveret trip eller vægt over maksimum pr. registrering): posten markeres
  `rejectedAt` og forsøges ikke igen — ellers ville den blokere resten af køen for evigt. Svaret
  bliver det samme uanset hvor mange gange den sendes.

## Fri vægt uden forbindelse

`src/lib/statusCache.ts` gemmer seneste kendte vægtstatus pr. trip i IndexedDB — kun beregnede
vægttal og tripnavn, aldrig tokens, sessioner eller historik. Registreringssiden viser snapshottet
med det samme og erstatter det med serverens tal, når de kommer.

`projectStatus()` lægger ventende køposter oven på det viste tal, så den frie vægt svarer til hvad
der faktisk er i vognen. Den genbruger den autoritative `computeStatus()` fra `src/shared/weight.ts`,
så lokale og serverberegnede tal følger samme regler (heltal gram, samme grænser for gul/rød).
Når tallene ikke er friske, står det på skærmen sammen med hvor gamle de er.

## Hvad der IKKE caches

Service workeren rører aldrig `/api/*` — hverken navigations-fallback eller runtime-cache.
Tokens, sessionssvar, historik og adminsvar ligger ikke i Cache Storage. Kun de vægttal appen selv
gemmer i IndexedDB, som beskrevet ovenfor.

## Opdateringer

Cache-first betyder, at en ny version ellers kunne blive låst ude. Derfor:

- `sw.js`, `index.html` og manifest serveres med `Cache-Control: no-cache`; kun `dist/assets/*`
  (indholdshashet) er `immutable`.
- Appen leder efter en ny version, hver gang den bliver synlig.
- En ny version aktiveres **ikke** af sig selv midt i en indtastning. Der vises et banner
  ("En ny version er klar"), og først når brugeren trykker Genindlæs, kaldes `skipWaiting()`.
