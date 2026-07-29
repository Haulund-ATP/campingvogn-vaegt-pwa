import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api } from "../lib/apiClient";
import { formatKg } from "../components/StatusCard";
import type { TripSummaryResponse } from "../types";

interface CreateResult {
  tripId: string;
  displayName: string;
  publicToken: string;
  addWeightUrl: string;
  removeWeightUrl: string;
}

export function AdminPage({ onLogout }: { onLogout: () => void }) {
  const [trips, setTrips] = useState<TripSummaryResponse[]>([]);
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const res = await api.get<{ trips: TripSummaryResponse[] }>("/admin/trips");
      setTrips(res.trips);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function archive(tripId: string) {
    await api.post(`/admin/trips/${encodeURIComponent(tripId)}/archive`);
    void refresh();
  }

  async function activate(tripId: string) {
    await api.post(`/admin/trips/${encodeURIComponent(tripId)}/activate`);
    void refresh();
  }

  const visibleTrips = trips.filter((t) => {
    if (filter === "active") return t.isActive;
    if (filter === "archived") return !t.isActive;
    return true;
  });

  if (createResult) {
    return <TripQrResult result={createResult} onDone={() => { setCreateResult(null); void refresh(); }} />;
  }

  if (creating) {
    return (
      <NewTripForm
        onCancel={() => setCreating(false)}
        onCreated={(result) => {
          setCreating(false);
          setCreateResult(result);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <h1>Trips</h1>
      <div className="filter-tabs">
        <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Aktive</button>
        <button className={filter === "archived" ? "active" : ""} onClick={() => setFilter("archived")}>Arkiverede</button>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Alle</button>
      </div>
      <button className="primary" onClick={() => setCreating(true)}>Nyt trip</button>
      {error && <p className="field-error">{error}</p>}
      <ul className="trip-list">
        {visibleTrips.map((trip) => (
          <li key={trip.tripId} className={`trip-row status-${trip.statusLevel}`}>
            <div>
              <strong>{trip.displayName}</strong> <span className="muted">({trip.tripId})</span>
              <p>
                {formatKg(trip.currentWeightKg)} / {formatKg(trip.maximumWeightKg)} kg
                {trip.isOverweight && <span className="overweight-warning"> — {formatKg(trip.overweightKg)} kg for tung</span>}
              </p>
              <p className="muted">{trip.entryCount} registreringer · {trip.isActive ? "Aktiv" : "Arkiveret"}</p>
            </div>
            <div className="row-actions">
              {trip.isActive ? (
                <button onClick={() => archive(trip.tripId)}>Arkivér</button>
              ) : (
                <button onClick={() => activate(trip.tripId)}>Genaktivér</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button onClick={onLogout}>Log ud</button>
    </div>
  );
}

function NewTripForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (result: CreateResult) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [tripId, setTripId] = useState("");
  const [tripIdTouched, setTripIdTouched] = useState(false);
  const [startWeightKg, setStartWeightKg] = useState("");
  const [maximumWeightKg, setMaximumWeightKg] = useState("");
  const [maximumEntryWeightKg, setMaximumEntryWeightKg] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const start = Number(startWeightKg.replace(",", "."));
    const max = Number(maximumWeightKg.replace(",", "."));
    const maxEntry = Number(maximumEntryWeightKg.replace(",", "."));
    if (!displayName.trim() || !tripId.trim()) {
      setError("Tripnavn og TripId skal udfyldes");
      return;
    }
    if (!Number.isFinite(start) || !Number.isFinite(max) || max <= start) {
      setError("Tilladt totalvægt skal være større end egenvægt");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<CreateResult>("/admin/trips", {
        tripId,
        displayName,
        startWeightKg: start,
        maximumWeightKg: max,
        maximumEntryWeightKg: maxEntry,
      });
      onCreated(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1>Nyt trip</h1>
      <form onSubmit={submit}>
        <label>
          Tripnavn
          <input
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!tripIdTouched) setTripId(slugify(e.target.value));
            }}
            required
          />
        </label>
        <label>
          TripId
          <input
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value);
              setTripIdTouched(true);
            }}
            required
          />
        </label>
        <label>
          Egenvægt (kg)
          <input value={startWeightKg} onChange={(e) => setStartWeightKg(e.target.value)} inputMode="decimal" required />
        </label>
        <label>
          Tilladt totalvægt (kg)
          <input value={maximumWeightKg} onChange={(e) => setMaximumWeightKg(e.target.value)} inputMode="decimal" required />
        </label>
        <label>
          Maksimal ændring pr. registrering (kg)
          <input value={maximumEntryWeightKg} onChange={(e) => setMaximumEntryWeightKg(e.target.value)} inputMode="decimal" required />
        </label>
        {startWeightKg && maximumWeightKg && (
          <p className="muted">
            Oprindelig lasteevne: {(Number(maximumWeightKg.replace(",", ".")) - Number(startWeightKg.replace(",", "."))).toFixed(1)} kg
          </p>
        )}
        {error && <p className="field-error">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={busy}>{busy ? "Opretter…" : "Opret trip"}</button>
          <button type="button" onClick={onCancel}>Annuller</button>
        </div>
      </form>
    </div>
  );
}

function TripQrResult({ result, onDone }: { result: CreateResult; onDone: () => void }) {
  const [addQr, setAddQr] = useState<string>("");
  const [removeQr, setRemoveQr] = useState<string>("");

  useEffect(() => {
    void QRCode.toDataURL(result.addWeightUrl, { width: 320 }).then(setAddQr);
    void QRCode.toDataURL(result.removeWeightUrl, { width: 320 }).then(setRemoveQr);
  }, [result]);

  return (
    <div className="screen">
      <h1>{result.displayName}</h1>
      <p className="muted">
        Gem eller udskriv QR-koderne nu — det klare token vises ikke igen. Hvis de mistes, skal tokenet roteres.
      </p>
      <div className="qr-pair">
        <div>
          <h2>Tilføj vægt</h2>
          {addQr && <img src={addQr} alt="QR-kode til at tilføje vægt" />}
          <a href={addQr} download={`${result.tripId}-tilfoej-vaegt.png`}>Download PNG</a>
        </div>
        <div>
          <h2>Fjern vægt</h2>
          {removeQr && <img src={removeQr} alt="QR-kode til at fjerne vægt" />}
          <a href={removeQr} download={`${result.tripId}-fjern-vaegt.png`}>Download PNG</a>
        </div>
      </div>
      <button onClick={onDone}>Til tripoversigten</button>
    </div>
  );
}
