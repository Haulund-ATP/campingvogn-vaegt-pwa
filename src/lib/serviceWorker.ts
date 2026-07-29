// Registrering af service workeren og broen til dens baggrundssynkronisering.

import { emitSynced, syncQueue } from "./sync";

const SW_URL = "/sw.js";
const QUEUE_SYNC_TAG = "cv-queue-flush";

let registration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;

interface Callbacks {
  /** En ny version af appen er hentet og klar til at tage over. */
  onUpdateReady: () => void;
}

export async function registerServiceWorker(callbacks: Callbacks): Promise<void> {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; count?: number } | null;
    if (data?.type !== "QUEUE_SYNCED") return;
    // Samme kanal som synkronisering i forgrunden, så skærmene opdaterer sig
    // selv uden at nulstille en igangværende indtastning.
    emitSynced({ synced: new Array(data.count ?? 0).fill(""), failed: [], rejected: [], sessionLost: false });
  });

  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    return; // Appen fungerer uden service worker, blot uden offline-start.
  }

  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting;
    callbacks.onUpdateReady();
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration?.installing;
    if (!installing) return;

    installing.addEventListener("statechange", () => {
      // Kun en opdatering hvis der allerede kørte en version — ellers er det
      // førstegangsinstallationen, som ikke skal afbryde brugeren.
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        waitingWorker = installing;
        callbacks.onUpdateReady();
      }
    });
  });
}

/** Aktiverer den ventende version. Kaldes først når brugeren siger ja. */
export function applyUpdate(): void {
  waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  waitingWorker = null;
  navigator.serviceWorker?.addEventListener("controllerchange", () => window.location.reload(), { once: true });
}

/** Leder efter en ny version. Billigt: kun sw.js hentes. */
export async function checkForUpdate(): Promise<void> {
  await registration?.update().catch(() => undefined);
}

/**
 * Beder om at køen bliver sendt. Med Background Sync sker det også hvis appen
 * lukkes, inden forbindelsen er tilbage. Ellers sendes køen her og nu.
 */
export async function requestQueueSync(): Promise<void> {
  // Background Sync findes ikke i TypeScripts DOM-typer og ikke i alle browsere
  // (bl.a. ikke på iOS), så den slås op defensivt.
  const backgroundSync = (registration as unknown as { sync?: { register(tag: string): Promise<void> } } | null)
    ?.sync;
  if (backgroundSync) {
    try {
      await backgroundSync.register(QUEUE_SYNC_TAG);
      return;
    } catch {
      // Falder igennem til synkronisering i forgrunden.
    }
  }
  await syncQueue();
}
