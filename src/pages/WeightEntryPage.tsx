import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/apiClient";
import { enqueue } from "../lib/offlineQueue";
import { syncQueueForTrip } from "../lib/sync";
import { StatusCard, formatKg } from "../components/StatusCard";
import type { EntryCategory } from "../types";
import type { StatusResponse } from "../types";

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

function newEntryId(): string {
  return crypto.randomUUID();
}

function parseWeightInput(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new Error("Ugyldigt vægtformat");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Vægten skal være et positivt tal");
  return value;
}

interface Props {
  tripId: string;
  action: "add" | "remove";
  onDone: () => void;
}

type ResultState =
  | { kind: "server"; status: StatusResponse; weightKg: number }
  | { kind: "pending"; estimate: string; weightKg: number }
  | null;

export function WeightEntryPage({ tripId, action, onDone }: Props) {
  const [displayName, setDisplayName] = useState<string>("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<EntryCategory>("Andet");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, [tripId]);

  async function loadStatus() {
    try {
      const s = await api.get<StatusResponse>("/status");
      setStatus(s);
      setDisplayName(s.displayName);
    } catch {
      // Kan ske offline; formularen virker stadig med lokalt estimat.
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let weightKg: number;
    try {
      weightKg = parseWeightInput(weightInput);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (!description.trim()) {
      setError("Angiv en kort beskrivelse");
      return;
    }

    setBusy(true);
    const entryId = newEntryId();
    const occurredAt = new Date().toISOString();
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      const response = await api.post<{ status: StatusResponse }>("/entries", {
        entryId,
        action,
        description,
        weightKg,
        category,
        notes: notes || undefined,
        occurredAt,
        clientTimeZone,
      });
      setResult({ kind: "server", status: response.status, weightKg });
      setStatus(response.status);
      void syncQueueForTrip(tripId);
    } catch (err) {
      await enqueue({
        entryId,
        tripId,
        action,
        description,
        weightKg,
        category,
        notes: notes || undefined,
        occurredAt,
        clientTimeZone,
        createdAt: occurredAt,
        attempts: 0,
      });
      const estimate = status ? estimateAfter(status, action, weightKg) : "ukendt (ingen tidligere status tilgængelig)";
      setResult({ kind: "pending", estimate, weightKg });
      if (err instanceof ApiError && err.status >= 500) {
        // server error, køen prøver igen senere
      }
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="screen">
        <h1>{action === "add" ? "Tilføj vægt" : "Fjern vægt"}</h1>
        {result.kind === "server" ? (
          <>
            <p className="result-headline">Registreringen er gemt</p>
            <StatusCard status={result.status} />
          </>
        ) : (
          <>
            <p className="result-headline">Registreringen venter på synkronisering</p>
            <p>Foreløbigt estimat: {result.estimate}</p>
            <p className="muted">Andre telefoner kan have foretaget registreringer i mellemtiden.</p>
          </>
        )}
        <div className="actions">
          <button
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
      {displayName && <p className="trip-name">{displayName}</p>}
      {status && (
        <p className="muted">
          Aktuel vægt: {formatKg(status.currentWeightKg)} kg —{" "}
          {status.isOverweight
            ? `${formatKg(status.overweightKg)} kg for tung`
            : `${formatKg(status.remainingWeightKg)} kg resterende lasteevne`}
        </p>
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
        {error && <p className="field-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Gemmer…" : "Registrer"}
        </button>
      </form>
    </div>
  );
}

function estimateAfter(status: StatusResponse, action: "add" | "remove", weightKg: number): string {
  const delta = action === "add" ? weightKg : -weightKg;
  const newCurrent = status.currentWeightKg + delta;
  const remaining = status.maximumWeightKg - newCurrent;
  if (remaining < 0) return `Campingvognen vil være cirka ${formatKg(Math.abs(remaining))} kg for tung`;
  return `Du kan tilføje yderligere ${formatKg(remaining)} kg`;
}
