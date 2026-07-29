import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../lib/apiClient";
import { enqueue, pendingDeltaKg } from "../lib/offlineQueue";
import { requestQueueSync } from "../lib/serviceWorker";
import { loadStatusSnapshot, projectStatus, saveStatusSnapshot } from "../lib/statusCache";
import { onSynced, syncQueue } from "../lib/sync";
import { WeightSummary } from "../components/WeightSummary";
import { formatKg } from "../lib/format";
import { parseUserWeightKg } from "../shared/weight";
import type { EntryCategory, StatusResponse } from "../types";

const CATEGORIES: EntryCategory[] = [
  "Campingudstyr",
  "Mad og drikke",
  "Vand",
  "Gas",
  "Tøj",
  "Personlige ting",
  "Køkken",
  "Elektronik",
  "Andet",
];

interface Props {
  tripId: string;
  action: "add" | "remove";
  onDone: () => void;
  onSessionLost: () => void;
}

type ResultState = { synced: boolean; weightKg: number } | null;

export function WeightEntryPage({ tripId, action, onDone, onSessionLost }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [pending, setPending] = useState<number[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<EntryCategory>("Andet");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [busy, setBusy] = useState(false);

  const refreshPending = useCallback(async () => {
    setPending(await pendingDeltaKg(tripId));
  }, [tripId]);

  const loadStatus = useCallback(async () => {
    // Det lokale snapshot vises først, så den frie vægt står der med det samme —
    // også mens containeren vågner, og selv helt uden forbindelse.
    const snapshot = await loadStatusSnapshot(tripId);
    if (snapshot) {
      setStatus(snapshot);
      setCachedAt(snapshot.cachedAt);
    }
    await refreshPending();

    try {
      const fresh = await api.get<StatusResponse>("/status", { retry: true });
      await saveStatusSnapshot(fresh);
      setStatus(fresh);
      setCachedAt(null);
    } catch (err) {
      if (err instanceof ApiError && err.isSessionLost) onSessionLost();
      // Offline eller serverfejl: snapshottet ovenfor bliver stående.
    }
  }, [tripId, refreshPending, onSessionLost]);

  useEffect(() => {
    void loadStatus();
    // Når køen bliver sendt (også fra service workeren), skal tallene opdateres.
    return onSynced(() => void loadStatus());
  }, [loadStatus]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let weightKg: number;
    try {
      weightKg = parseUserWeightKg(weightInput);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (!description.trim()) {
      setError("Angiv en kort beskrivelse");
      return;
    }

    setBusy(true);
    const entryId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const payload = {
      entryId,
      action,
      description,
      weightKg,
      category,
      notes: notes || undefined,
      occurredAt,
      clientTimeZone,
    };

    try {
      const response = await api.post<{ status: StatusResponse }>("/entries", payload, { retry: true });
      await saveStatusSnapshot(response.status);
      setStatus(response.status);
      setCachedAt(null);
      setResult({ synced: true, weightKg });
      void syncQueue(tripId).then(refreshPending);
    } catch (err) {
      if (err instanceof ApiError && !err.isRetryableLater && !err.isSessionLost) {
        // Serveren har afvist posten (fx for tung eller arkiveret trip) — den
        // skal ikke i køen, for svaret bliver det samme næste gang.
        setError(err.detail ?? err.title);
        setBusy(false);
        return;
      }

      await enqueue({ ...payload, tripId, createdAt: occurredAt, attempts: 0 });
      await refreshPending();
      await requestQueueSync().catch(() => undefined);
      setResult({ synced: false, weightKg });

      if (err instanceof ApiError && err.isSessionLost) onSessionLost();
    } finally {
      setBusy(false);
    }
  }

  const figures = status ? projectStatus(status, pending) : null;

  if (result) {
    return (
      <div className="screen">
        <h1>{action === "add" ? "Tilføj vægt" : "Fjern vægt"}</h1>
        <p className="result-headline">
          {result.synced
            ? `${formatKg(result.weightKg)} kg er registreret`
            : `${formatKg(result.weightKg)} kg er gemt og sendes automatisk`}
        </p>
        {status && <h2>{status.displayName}</h2>}
        {figures && <WeightSummary figures={figures} pendingCount={pending.length} cachedAt={cachedAt} />}
        {!result.synced && (
          <p className="muted">
            Registreringen ligger på telefonen, indtil der er forbindelse. Andre telefoner kan have registreret
            i mellemtiden.
          </p>
        )}
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              setResult(null);
              setWeightInput("");
              setDescription("");
              setNotes("");
            }}
          >
            Registrer mere
          </button>
          <button onClick={onDone}>Til forsiden</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>{action === "add" ? "Tilføj vægt" : "Fjern vægt"}</h1>
      {status && <p className="trip-name">{status.displayName}</p>}
      {figures ? (
        <WeightSummary figures={figures} pendingCount={pending.length} cachedAt={cachedAt} />
      ) : (
        <p className="muted">Henter aktuel vægt…</p>
      )}
      <form onSubmit={submit}>
        <label>
          Vægt (kg)
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            required
          />
        </label>
        <label>
          Beskrivelse
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label>
          Kategori
          <select value={category} onChange={(e) => setCategory(e.target.value as EntryCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note (valgfri)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {weightInput && figures && <PreviewLine figures={figures} action={action} input={weightInput} />}
        {error && <p className="field-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Gemmer…" : "Registrer"}
        </button>
      </form>
    </div>
  );
}

/** Viser hvad den frie vægt bliver, før man trykker registrer. */
function PreviewLine({
  figures,
  action,
  input,
}: {
  figures: StatusResponse;
  action: "add" | "remove";
  input: string;
}) {
  let weightKg: number;
  try {
    weightKg = parseUserWeightKg(input);
  } catch {
    return null;
  }

  const after = projectStatus(figures, [action === "add" ? weightKg : -weightKg]);
  return (
    <p className={after.isOverweight ? "field-error" : "muted"}>
      {after.isOverweight
        ? `Efter denne registrering: ${formatKg(after.overweightKg)} kg for tung`
        : `Efter denne registrering: ${formatKg(after.remainingWeightKg)} kg fri vægt tilbage`}
    </p>
  );
}
