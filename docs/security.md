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
- Public sessioner: 4 timer. Administratorsessioner: 30 minutter.
- Hver request genvalideres mod den aktuelle tokenversion i SharePoint — en rotation slår derfor
  igennem med det samme, uden at API'et behøver en separat blocklist.

## CSRF

Double-submit cookie: en ikke-`HttpOnly`-cookie (`cv_csrf`) skal matche en tilsvarende header
(`x-cv-csrf`) på alle muterende kald. `SameSite=Strict` er ekstra forsvar, ikke den eneste
beskyttelse.

## Rate limiting

Bounded in-memory tællere pr. container-instans (se `server/src/lib/rateLimit.ts`). Dette er
**ikke** en absolut distribueret garanti — med `max-replicas 1` kører der dog kun én instans ad
gangen i denne løsning, hvilket gør det til en reelt effektiv første forsvarslinje mod
brute-force af tokens; det erstatter ikke tokenernes egen entropi.

## Managed Identity i stedet for client secret

Serveren autentificerer til Microsoft Graph med Container Appens system-assigned Managed Identity
via `@azure/identity`s `DefaultAzureCredential` — der findes intet Entra client secret at lække,
rotere eller opbevare i denne løsning. Lokalt (uden for Azure) falder samme kode tilbage til
udviklerens egen `az login`-session.

## Hvad browseren aldrig ser

Graph-access/refresh-tokens, SharePoint-legitimationsoplysninger, session-signeringsnøgle,
token-peppers, rate-limit-pepper. Se `.gitignore` og `SECURITY.md`.
