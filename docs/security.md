# Sikkerhed i drift

## Tokens

- Public token (pr. trip) og globalt administratortoken er begge ≥32 kryptografisk tilfældige
  bytes, vist i klartekst præcis én gang (ved oprettelse/rotation), og gemt kun som
  HMAC-SHA-256-hash med en dedikeret pepper (`TOKEN_HASH_PEPPER`).
- Sammenligning sker i konstant tid (`crypto.timingSafeEqual`).
- Rotation hæver altid en versionstæller, som ugyldiggør alle eksisterende sessioner udstedt mod
  den gamle version — uden at skulle føre en revocation-liste.

## Sessioner

- Signeret, ikke-krypteret payload (HMAC-SHA-256) i en `HttpOnly; Secure; SameSite=Strict`-cookie.
  Indeholder rolle, trip/tokenversion og udløbstidspunkt.
- Public sessioner: 30 dage. Administratorsessioner: 8 timer.
- **Glidende fornyelse** (`server/src/lib/sessionRenewal.ts`): når mindre end halvdelen af
  levetiden er tilbage, får svaret på et vilkårligt `/api`-kald en frisk sessionscookie med samme
  `sessionId` og tokenversion. Aktiv brug forlænger dermed sessionen, mens en ubrugt session
  fortsat udløber efter sin TTL. Appen kalder `POST /api/session/heartbeat` hvert 10. minut, mens
  den er åben, så fornyelsen også sker uden brugerhandlinger.
- Afvejningen ved 30 dage: den, der har telefonen, kan registrere vægt på trippet i op til 30 dage
  efter sidste scan. Sessionen giver kun adgang til registrering på det ene trip — ikke til
  administration — og kan altid ugyldiggøres med `public-token/rotate`.
- Hver request genvalideres mod den aktuelle tokenversion i SharePoint — en rotation slår derfor
  igennem med det samme, uden at API'et behøver en separat blocklist. Heartbeatet er undtaget
  (ren HMAC-verifikation uden Graph-kald), fordi det kun forlænger en session, der i forvejen er
  gyldig; første efterfølgende datakald håndhæver tilbagekaldelsen.

## CSRF

Double-submit cookie: en ikke-`HttpOnly`-cookie (`cv_csrf`) skal matche en tilsvarende header
(`x-cv-csrf`) på alle muterende kald. `SameSite=Strict` er ekstra forsvar, ikke den eneste
beskyttelse. Ved sessionsfornyelse genudstedes cookien med **samme værdi** og ny levetid, så
double-submit fortsat matcher.

Service workeren kan ikke læse cookies på alle platforme, men skal kunne sende offlinekøen i
baggrunden. Derfor spejles CSRF-tokenet til IndexedDB (`meta`-store, nøgle `csrfToken`). Det
udvider ikke angrebsfladen: cookien er per design læsbar for JavaScript på samme origin, og
IndexedDB er lige så origin-bundet som cookien.

## Rate limiting

Bounded in-memory tællere pr. container-instans (se `server/src/lib/rateLimit.ts`). Dette er
**ikke** en absolut distribueret garanti — med `max-replicas 1` kører der dog kun én instans ad
gangen i denne løsning, hvilket gør det til en reelt effektiv første forsvarslinje mod
brute-force af tokens; det erstatter ikke tokenernes egen entropi.

Ved tokenudveksling tælles **kun mislykkede forsøg** (`isBlocked` + `recordFailedAttempt`). Et
gyldigt QR-scan må derfor gentages frit — nødvendigt fordi det første kald efter scale-to-zero kan
timeoute og skal prøves igen — mens gæt fortsat bremses efter få fejl fra samme IP.

## Managed Identity i stedet for client secret

Serveren autentificerer til Microsoft Graph med Container Appens system-assigned Managed Identity
via `@azure/identity`s `DefaultAzureCredential` — der findes intet Entra client secret at lække,
rotere eller opbevare i denne løsning. Lokalt (uden for Azure) falder samme kode tilbage til
udviklerens egen `az login`-session.

## Hvad browseren aldrig ser

Graph-access/refresh-tokens, SharePoint-legitimationsoplysninger, session-signeringsnøgle,
token-peppers, rate-limit-pepper. Se `.gitignore` og `SECURITY.md`.
