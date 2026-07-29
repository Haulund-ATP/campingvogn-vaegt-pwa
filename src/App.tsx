import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { parseHashRoute, clearHash, type HashRoute } from "./lib/hashRoute";
import { ApiError, OfflineError, api } from "./lib/apiClient";
import { startKeepAlive } from "./lib/keepAlive";
import { applyUpdate, registerServiceWorker } from "./lib/serviceWorker";
import { loadLatestStatusSnapshot, projectStatus, saveStatusSnapshot } from "./lib/statusCache";
import { pendingDeltaKg } from "./lib/offlineQueue";
import { onSynced, syncQueue } from "./lib/sync";
import { WeightSummary } from "./components/WeightSummary";
import { Landing } from "./pages/Landing";
import { WeightEntryPage } from "./pages/WeightEntryPage";
import { AdminPage } from "./pages/AdminPage";
import type { StatusResponse } from "./types";
import "./index.css";

type View =
  | { kind: "boot"; message: string }
  | { kind: "bootFailed"; message: string; canRetry: boolean }
  | { kind: "landing"; reason?: string }
  | { kind: "weight"; tripId: string; action: "add" | "remove" }
  | { kind: "admin" }
  | { kind: "continue"; status: StatusResponse; cachedAt: string | null; pendingCount: number };

const BOOT_MESSAGE = "Åbner…";
const WAKING_MESSAGE = "Serveren starter op — det tager typisk et par sekunder…";

function App() {
  const [view, setView] = useState<View>({ kind: "boot", message: BOOT_MESSAGE });
  const [updateReady, setUpdateReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  // Tokenet fra QR-koden beholdes her, så "Prøv igen" virker uden at scanne igen.
  const route = useRef<HashRoute>({ action: null });
  const keepAliveStarted = useRef(false);

  const startKeepAliveOnce = useCallback(() => {
    if (keepAliveStarted.current) return;
    keepAliveStarted.current = true;
    startKeepAlive({
      onSessionLost: () => setView({ kind: "landing", reason: "Sessionen er udløbet. Scan QR-koden igen." }),
      onConnectivityChange: setOnline,
    });
  }, []);

  const bootstrap = useCallback(async () => {
    setView({ kind: "boot", message: BOOT_MESSAGE });
    const onAttemptFailed = () => setView({ kind: "boot", message: WAKING_MESSAGE });

    if (route.current.action === "admin") {
      const token = route.current.token;
      try {
        await api.post("/session/admin/exchange", { token }, { retry: true, onAttemptFailed });
        clearHash();
        startKeepAliveOnce();
        setView({ kind: "admin" });
      } catch (err) {
        setView(bootFailure(err, "Kunne ikke logge ind som administrator."));
      }
      return;
    }

    if (route.current.action === "add" || route.current.action === "remove") {
      const { trip, token, action } = route.current;
      try {
        await api.post("/session/exchange", { tripId: trip, token }, { retry: true, onAttemptFailed });
        // Hash'et ryddes først når sessionen står — ellers ville en fejl tvinge
        // brugeren til at scanne QR-koden igen.
        clearHash();
        startKeepAliveOnce();
        setView({ kind: "weight", tripId: trip, action });
      } catch (err) {
        setView(bootFailure(err, "Kunne ikke åbne trippet."));
      }
      return;
    }

    // Ingen QR scannet: fortsæt på en eksisterende session, ellers landingssiden.
    try {
      const status = await api.get<StatusResponse>("/status", { retry: true, onAttemptFailed });
      await saveStatusSnapshot(status);
      startKeepAliveOnce();
      void syncQueue(status.tripId);
      setView(await buildContinueView(status, null));
    } catch (err) {
      // Kan serveren ikke nås, må brugeren ikke sendes til landingssiden — det
      // ser ud som om sessionen er væk, og så scanner man QR-koden unødigt.
      const unreachable = err instanceof OfflineError || (err instanceof ApiError && err.isRetryableLater);
      if (unreachable) {
        const snapshot = await loadLatestStatusSnapshot();
        if (snapshot) {
          startKeepAliveOnce();
          setView(await buildContinueView(snapshot, snapshot.cachedAt));
          return;
        }
        setView({
          kind: "bootFailed",
          message: "Kunne ikke få forbindelse til serveren, og der er ingen gemte tal på telefonen endnu.",
          canRetry: true,
        });
        return;
      }
      setView({ kind: "landing" });
    }
  }, [startKeepAliveOnce]);

  useEffect(() => {
    route.current = parseHashRoute(window.location.hash);
    void bootstrap();

    void registerServiceWorker({ onUpdateReady: () => setUpdateReady(true) });
  }, [bootstrap]);

  // Når køen er sendt, skal den frie vægt på oversigten opdateres — men kun der,
  // så en igangværende indtastning på registreringssiden ikke bliver nulstillet.
  useEffect(
    () =>
      onSynced(() => {
        if (view.kind === "continue") void bootstrap();
      }),
    [view.kind, bootstrap]
  );

  const banner = (
    <>
      {updateReady && (
        <div className="banner banner-update">
          <span>En ny version er klar.</span>
          <button onClick={applyUpdate}>Genindlæs</button>
        </div>
      )}
      {!online && <div className="banner banner-offline">Offline — registreringer gemmes og sendes automatisk.</div>}
    </>
  );

  function wrap(content: ReactNode) {
    return (
      <>
        {banner}
        {content}
      </>
    );
  }

  if (view.kind === "boot") {
    return wrap(
      <div className="screen boot-screen">
        <div className="spinner" aria-hidden="true" />
        <p aria-live="polite">{view.message}</p>
      </div>
    );
  }

  if (view.kind === "bootFailed") {
    return wrap(
      <div className="screen">
        <h1>Kunne ikke åbne appen</h1>
        <p>{view.message}</p>
        {view.canRetry && (
          <button className="primary" onClick={() => void bootstrap()}>
            Prøv igen
          </button>
        )}
        <p className="muted">QR-koden er stadig gyldig — du behøver ikke scanne igen.</p>
      </div>
    );
  }

  if (view.kind === "admin") {
    return wrap(
      <AdminPage
        onLogout={async () => {
          await api.post("/session/logout").catch(() => undefined);
          setView({ kind: "landing" });
        }}
      />
    );
  }

  if (view.kind === "weight") {
    return wrap(
      <WeightEntryPage
        tripId={view.tripId}
        action={view.action}
        onDone={() => void bootstrap()}
        onSessionLost={() => setView({ kind: "landing", reason: "Sessionen er udløbet. Scan QR-koden igen." })}
      />
    );
  }

  if (view.kind === "continue") {
    return wrap(
      <div className="screen">
        <h1>{view.status.displayName}</h1>
        <WeightSummary figures={view.status} pendingCount={view.pendingCount} cachedAt={view.cachedAt} />
        <div className="actions">
          <button className="primary" onClick={() => setView({ kind: "weight", tripId: view.status.tripId, action: "add" })}>
            Tilføj vægt
          </button>
          <button onClick={() => setView({ kind: "weight", tripId: view.status.tripId, action: "remove" })}>
            Fjern vægt
          </button>
        </div>
      </div>
    );
  }

  return wrap(<Landing reason={view.reason} />);
}

function bootFailure(err: unknown, prefix: string): View {
  if (err instanceof OfflineError) {
    return {
      kind: "bootFailed",
      message: err.timedOut
        ? `${prefix} Serveren svarede ikke i tide.`
        : `${prefix} Der er ingen forbindelse lige nu.`,
      canRetry: true,
    };
  }
  if (err instanceof ApiError && err.status === 429) {
    return { kind: "bootFailed", message: `${prefix} For mange forsøg — vent et par minutter.`, canRetry: true };
  }
  if (err instanceof ApiError && err.isTransient) {
    return { kind: "bootFailed", message: `${prefix} Serveren svarede med en fejl. Prøv igen.`, canRetry: true };
  }
  if (err instanceof ApiError) {
    return { kind: "bootFailed", message: `${prefix} ${err.detail ?? err.title}`, canRetry: false };
  }
  return { kind: "bootFailed", message: prefix, canRetry: true };
}

// Fri vægt vises altid fremskrevet med det, der endnu ikke er sendt, så tallet
// stemmer med hvad brugeren faktisk har lagt i vognen.
async function buildContinueView(status: StatusResponse, cachedAt: string | null): Promise<View> {
  const pending = await pendingDeltaKg(status.tripId);
  return {
    kind: "continue",
    status: projectStatus(status, pending),
    cachedAt,
    pendingCount: pending.length,
  };
}

export default App;
