/// <reference lib="webworker" />

// Egen service worker. To opgaver:
//  1. App-shellen serveres cache-first, så appen starter med det samme — også
//     når containeren er skaleret til nul og først skal vækkes.
//  2. Offlinekøen sendes i baggrunden, når forbindelsen kommer tilbage.
//
// /api/* håndteres aldrig af cachen: tokens, sessioner, historik og adminsvar
// må ikke ligge på disken. Kun de vægttal appen selv gemmer i IndexedDB.

import {
  CSRF_META_KEY,
  getMeta,
  listAllQueued,
  removeFromQueue,
  updateAttempt,
  type QueuedEntry,
} from "./lib/offlineQueue";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Background Sync og Periodic Background Sync er endnu ikke i TypeScripts
// webworker-lib, så hændelserne erklæres her.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

declare global {
  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
    periodicsync: SyncEvent;
  }
}

const CACHE_NAME = "cv-shell";
const SHELL_URL = "/index.html";
export const QUEUE_SYNC_TAG = "cv-queue-flush";

const precacheUrls = [...new Set([...self.__WB_MANIFEST.map((entry) => entry.url), SHELL_URL])].map(
  (url) => new URL(url, self.registration.scope).pathname
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: "reload" springer HTTP-cachen over, så en ny version af de
      // uhashede filer (index.html, ikoner) faktisk hentes frisk.
      await Promise.all(
        precacheUrls.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (response.ok) await cache.put(url, response);
          } catch {
            // Et enkelt asset må ikke vælte installationen.
          }
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE_NAME) await caches.delete(name);
      }

      // Ryd filer fra tidligere builds ud af shell-cachen.
      const cache = await caches.open(CACHE_NAME);
      const wanted = new Set(precacheUrls);
      for (const request of await cache.keys()) {
        if (!wanted.has(new URL(request.url).pathname)) await cache.delete(request);
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // Aldrig cache på API-svar.

  if (request.mode === "navigate") {
    event.respondWith(serveShell());
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function serveShell(): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(SHELL_URL);
  if (cached) return cached;

  try {
    return await fetch(SHELL_URL);
  } catch {
    return new Response("Appen er ikke tilgængelig offline endnu. Åbn den én gang med forbindelse.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Kun egne, hele svar gemmes — ikke fejl eller delvise svar.
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const fallback = await cache.match(new URL(request.url).pathname);
    if (fallback) return fallback;
    throw err;
  }
}

// Background Sync: browseren kalder denne, når forbindelsen er tilbage — også
// hvis appen er lukket. Ikke understøttet på iOS, hvor appen i stedet sender
// køen ved opstart og ved online-hændelser.
self.addEventListener("sync", (event) => {
  if (event.tag !== QUEUE_SYNC_TAG) return;
  event.waitUntil(flushQueue());
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag !== QUEUE_SYNC_TAG) return;
  event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (data?.type === "FLUSH_QUEUE") event.waitUntil(flushQueue());
});

async function flushQueue(): Promise<void> {
  const pending = await listAllQueued();
  if (pending.length === 0) return;

  const csrfToken = await getMeta<string>(CSRF_META_KEY);
  if (!csrfToken) return; // Uden CSRF-token afvises kaldet; appen sender køen i stedet.

  pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let sent = 0;

  for (const entry of pending) {
    const outcome = await sendEntry(entry, csrfToken);
    if (outcome === "sent") {
      await removeFromQueue(entry.entryId);
      sent++;
      continue;
    }
    if (outcome === "rejected") {
      await updateAttempt(entry.entryId, "Afvist af serveren", true);
      continue;
    }
    // Offline, session udløbet eller serverfejl: stop og lad browseren
    // prøve igen ved næste sync-hændelse.
    await updateAttempt(entry.entryId, "Kunne ikke sendes i baggrunden");
    throw new Error("Synkronisering ikke færdig");
  }

  if (sent > 0) {
    for (const client of await self.clients.matchAll()) {
      client.postMessage({ type: "QUEUE_SYNCED", count: sent });
    }
  }
}

async function sendEntry(entry: QueuedEntry, csrfToken: string): Promise<"sent" | "rejected" | "retry"> {
  try {
    const response = await fetch("/api/entries", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-cv-csrf": csrfToken },
      body: JSON.stringify({
        entryId: entry.entryId,
        action: entry.action,
        description: entry.description,
        weightKg: entry.weightKg,
        category: entry.category,
        notes: entry.notes,
        deviceLabel: entry.deviceLabel,
        occurredAt: entry.occurredAt,
        clientTimeZone: entry.clientTimeZone,
      }),
    });

    if (response.ok) return "sent";
    // 401/403 (session væk), 429 (rate limit) og 5xx skal prøves igen.
    // Øvrige 4xx giver samme svar uanset hvor mange gange posten sendes.
    if (response.status === 401 || response.status === 403 || response.status === 429) return "retry";
    if (response.status >= 500) return "retry";
    return "rejected";
  } catch {
    return "retry";
  }
}
