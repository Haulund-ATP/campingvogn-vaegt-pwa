// Holder sessionen i live og køen tom, så længe appen er åben.
//
// Serveren fornyer sessionscookien på alle API-kald, når sessionen er over
// halvvejs gennem sin levetid (sessionRenewal på serveren). Heartbeatet her er
// det kald, der udløser fornyelsen, når brugeren ikke selv gør noget — og det
// opdager samtidig, hvis sessionen er blevet tilbagekaldt.

import { ApiError, OfflineError, api } from "./apiClient";
import { checkForUpdate, requestQueueSync } from "./serviceWorker";
import { syncQueue } from "./sync";

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
// Undgå en byge af kald når fanen skifter frem og tilbage.
const MIN_INTERVAL_BETWEEN_PINGS_MS = 60 * 1000;

interface Handlers {
  /** Sessionen er væk — brugeren skal scanne QR-koden igen. */
  onSessionLost: () => void;
  /** Forbindelsen skiftede tilstand. */
  onConnectivityChange?: (online: boolean) => void;
}

export interface SessionInfo {
  role: "public" | "system-admin";
  tripId: string | null;
  expiresAt: string;
}

let lastPingAt = 0;

export async function heartbeat(): Promise<SessionInfo | null> {
  try {
    return await api.post<SessionInfo>("/session/heartbeat");
  } catch (err) {
    if (err instanceof OfflineError) return null;
    if (err instanceof ApiError && err.isSessionLost) throw err;
    return null;
  }
}

/**
 * Starter overvågningen. Returnerer en oprydningsfunktion.
 * Kaldes én gang, når en session er etableret.
 */
export function startKeepAlive(handlers: Handlers): () => void {
  const tick = async (force = false) => {
    if (!navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastPingAt < MIN_INTERVAL_BETWEEN_PINGS_MS) return;
    lastPingAt = now;

    try {
      await heartbeat();
    } catch (err) {
      if (err instanceof ApiError && err.isSessionLost) {
        handlers.onSessionLost();
        return;
      }
    }

    await requestQueueSync().catch(() => undefined);
  };

  const interval = window.setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void tick();
    void checkForUpdate();
  };

  const onOnline = () => {
    handlers.onConnectivityChange?.(true);
    void tick(true);
  };

  const onOffline = () => handlers.onConnectivityChange?.(false);

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Send det, der eventuelt ligger i køen fra sidste gang appen var åben.
  void syncQueue().catch(() => undefined);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
