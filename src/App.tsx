import { useEffect, useState } from "react";
import { parseHashRoute, clearHash } from "./lib/hashRoute";
import { api, ApiError } from "./lib/apiClient";
import { Landing } from "./pages/Landing";
import { WeightEntryPage } from "./pages/WeightEntryPage";
import { AdminPage } from "./pages/AdminPage";
import type { StatusResponse } from "./types";
import "./index.css";

type View =
  | { kind: "loading" }
  | { kind: "landing" }
  | { kind: "weight"; tripId: string; action: "add" | "remove" }
  | { kind: "admin" }
  | { kind: "continue"; status: StatusResponse; action: "add" | "remove" };

function App() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    const route = parseHashRoute(window.location.hash);

    if (route.action === "admin") {
      try {
        await api.post("/session/admin/exchange", { token: route.token });
        clearHash();
        setView({ kind: "admin" });
        return;
      } catch {
        clearHash();
        setView({ kind: "landing" });
        return;
      }
    }

    if (route.action === "add" || route.action === "remove") {
      try {
        await api.post("/session/exchange", { tripId: route.trip, token: route.token });
        clearHash();
        setView({ kind: "weight", tripId: route.trip, action: route.action });
        return;
      } catch {
        clearHash();
        setView({ kind: "landing" });
        return;
      }
    }

    // Ingen QR scannet i denne visning: tjek for eksisterende gyldig session.
    try {
      const status = await api.get<StatusResponse>("/status");
      setView({ kind: "continue", status, action: "add" });
      return;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // netværksfejl / offline — vis landing, brugeren kan stadig scanne igen når online
      }
    }

    setView({ kind: "landing" });
  }

  if (view.kind === "loading") return <div className="screen" />;

  if (view.kind === "admin") {
    return (
      <AdminPage
        onLogout={async () => {
          await api.post("/session/logout").catch(() => undefined);
          setView({ kind: "landing" });
        }}
      />
    );
  }

  if (view.kind === "weight") {
    return <WeightEntryPage tripId={view.tripId} action={view.action} onDone={() => setView({ kind: "landing" })} />;
  }

  if (view.kind === "continue") {
    return (
      <div className="screen">
        <h1>{view.status.displayName}</h1>
        <p className="muted">Du har en aktiv session for dette trip.</p>
        <div className="actions">
          <button onClick={() => setView({ kind: "weight", tripId: view.status.tripId, action: "add" })}>
            Tilføj vægt
          </button>
          <button onClick={() => setView({ kind: "weight", tripId: view.status.tripId, action: "remove" })}>
            Fjern vægt
          </button>
        </div>
      </div>
    );
  }

  return <Landing />;
}

export default App;
