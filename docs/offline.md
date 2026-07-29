# Offlinekø

Implementeret i `src/lib/offlineQueue.ts` (IndexedDB via `idb`) og `src/lib/sync.ts`.

## Princip

Hver registrering får et stabilt `EntryId` (UUID) med det samme, uanset om enheden er online eller
offline. Ved offline-forsøg lægges posten i IndexedDB med det samme `EntryId`, som genbruges ved
alle efterfølgende synkroniseringsforsøg — det er det, der gør serverens idempotens-kontrol
(samme `EntryId` ⇒ samme resultat) effektiv mod dubletter.

## Synkroniseringstidspunkter

- Ved appstart (`syncQueueForTrip` kaldes efter en vellykket registrering).
- Ved næste vellykkede request til samme trip.
- Manuel gentagelse er implicit: brugeren kan altid trykke "Registrer mere", hvilket forsøger igen.

Background Sync (Service Worker) er ikke implementeret i denne version — appstart- og
efter-request-synkronisering er den primære mekanisme, som virker uden browserunderstøttelse for
Background Sync.

## Hvad der IKKE caches

Service workeren (`vite-plugin-pwa`) ekskluderer eksplicit `/api/*` fra navigations-fallback —
tokens, sessionssvar, historik og adminsvar caches aldrig.

## Sessionsudløb under offline-kø

Hvis sessionen er udløbet, når køen forsøger at synkronisere, stopper synkroniseringen ved første
401/403 og bevarer resten af køen uændret (`src/lib/sync.ts`). Brugeren skal scanne QR-koden igen
for at få en ny session; køen mistes ikke og flyttes aldrig mellem trips.
